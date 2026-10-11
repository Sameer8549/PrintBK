/**
 * Count pages/slides for any printable file type.
 * All parsing runs in the browser — no server needed.
 *
 * Supported:
 *  .pdf   → pdfjs-dist (exact)
 *  .pptx  → JSZip: count ppt/slides/slide*.xml  (exact)
 *  .ppt   → binary: cannot parse → estimate 1 slide
 *  .docx  → JSZip: read docProps/app.xml <Pages> (exact)
 *  .doc   → binary: cannot parse → estimate 1
 *  .txt   → estimate: ~3000 chars per A4 page
 *  images → always 1
 */

async function countViaPdfJs(file: File): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const buf = await file.arrayBuffer();
  // ignoreEncryption allows it to read page counts even if the PDF has a blank password or mild restrictions
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
}

async function countViaPptx(file: File): Promise<number> {
  const JSZip = (await import('jszip')).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // 1. [Content_Types].xml (OpenXML standard slide registry — most accurate!)
  const ctKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('[content_types].xml'));
  if (ctKey) {
    const text = await zip.files[ctKey].async('text');
    const ctCount = (text.match(/application\/vnd\.openxmlformats-officedocument\.presentationml\.slide\+xml/gi) || []).length;
    if (ctCount > 0) return ctCount;
  }

  // 2. ppt/presentation.xml (<p:sldIdLst> contains exact ordered list of slides)
  const presKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('ppt/presentation.xml'));
  if (presKey) {
    const text = await zip.files[presKey].async('text');
    const sldMatches = (text.match(/<[^:]*:?sldId[\s>]/gi) || []).length;
    if (sldMatches > 0) return sldMatches;
  }

  // 3. Count slide XML files in zip (handles both Windows \ and Unix /)
  const slideKeys = Object.keys(zip.files).filter(k => {
    const norm = k.replace(/\\/g, '/').toLowerCase();
    return norm.includes('/slides/') && norm.endsWith('.xml') && !norm.includes('_rels') && !norm.includes('slidelayout') && !norm.includes('slidemaster');
  });
  if (slideKeys.length > 0) return slideKeys.length;

  // 4. Check docProps/app.xml for <Slides>N</Slides> or <Pages>N</Pages>
  const appKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('docprops/app.xml'));
  if (appKey) {
    const text = await zip.files[appKey].async('text');
    const match = text.match(/<(?:[a-zA-Z0-9]+:)?Slides[^>]*>\s*(\d+)\s*<\//i) || text.match(/<(?:[a-zA-Z0-9]+:)?Pages[^>]*>\s*(\d+)\s*<\//i);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0) return count;
    }
  }

  return 1;
}

async function countViaPpt(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // 1. If it has ZIP magic bytes (0x50, 0x4B), it's a PPTX file saved with .ppt extension!
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    return await countViaPptx(file);
  }

  // 2. Binary PPT (OLE2 format)
  try {
    const CFB = (await import('cfb')).default || (await import('cfb'));
    const cfb = CFB.read(bytes, { type: 'array' });
    
    // Check DocumentSummaryInformation for PIDDSI_SLIDES (0x10)
    const docSum = cfb.FileIndex.find((f: any) => f.name.includes('DocumentSummaryInformation'));
    if (docSum && docSum.content) {
      const stream = new Uint8Array(docSum.content);
      for (let i = 0; i < stream.length - 8; i++) {
        if (stream[i] === 0x10 && stream[i+1] === 0x00 && stream[i+2] === 0x00 && stream[i+3] === 0x00) {
          const propOffset = stream[i+4] | (stream[i+5] << 8) | (stream[i+6] << 16) | (stream[i+7] << 24);
          if (propOffset > 0 && propOffset < stream.length - 8) {
            const valType = stream[propOffset] | (stream[propOffset+1] << 8);
            if (valType === 3) {
              const count = stream[propOffset+4] | (stream[propOffset+5] << 8) | (stream[propOffset+6] << 16) | (stream[propOffset+7] << 24);
              if (count > 0 && count < 1000) return count;
            }
          }
        }
      }
    }

    // Check PowerPoint Document stream for RT_SlidePersistAtom (0x03F8)
    const pptDoc = cfb.FileIndex.find((f: any) => f.name.includes('PowerPoint Document'));
    if (pptDoc && pptDoc.content) {
      const docStream = new Uint8Array(pptDoc.content);
      let persistCount = 0;
      let slideContainers = 0;
      for (let i = 0; i < docStream.length - 8; i++) {
        const recType = docStream[i+2] | (docStream[i+3] << 8);
        if (recType === 0x03F8) persistCount++;
        if (recType === 0x03EE) slideContainers++;
      }
      if (persistCount > 0) return persistCount;
      if (slideContainers > 0) return slideContainers;
    }
  } catch (err) {
    console.warn('CFB ppt parsing error:', err);
  }

  // Fallback direct scan for RT_SlidePersistAtom
  let count = 0;
  for (let i = 0; i < bytes.length - 8; i++) {
    const recType = bytes[i+2] | (bytes[i+3] << 8);
    if (recType === 0x03F8) count++;
  }
  if (count > 0) return count;

  return 1;
}

async function countViaDocx(file: File): Promise<number> {
  const JSZip = (await import('jszip')).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // 1. Try docProps/app.xml first — contains <Pages>N</Pages>
  const appKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('docprops/app.xml'));
  if (appKey) {
    const text = await zip.files[appKey].async('text');
    const match = text.match(/<(?:[a-zA-Z0-9]+:)?Pages[^>]*>\s*(\d+)\s*<\//i);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0) return count;
    }
  }

  // 2. Count from word/document.xml with page breaks & character length
  const docKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('word/document.xml'));
  if (docKey) {
    const text = await zip.files[docKey].async('text');
    const pageBreaks = (text.match(/<w:br\s+[^>]*w:type=["']page["']/gi) || []).length;
    const sectBreaks = (text.match(/<w:sectPr/gi) || []).length;
    const explicitPages = Math.max(pageBreaks + 1, sectBreaks);

    const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const estimated = Math.max(1, Math.ceil(plain.length / 2500));
    return Math.max(explicitPages, estimated);
  }
  return 1;
}

async function countViaDoc(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    return await countViaDocx(file);
  }
  try {
    const CFB = (await import('cfb')).default || (await import('cfb'));
    const cfb = CFB.read(bytes, { type: 'array' });
    const docSum = cfb.FileIndex.find((f: any) => f.name.includes('SummaryInformation'));
    if (docSum && docSum.content) {
      const stream = new Uint8Array(docSum.content);
      for (let i = 0; i < stream.length - 8; i++) {
        if (stream[i] === 0x0E && stream[i+1] === 0x00 && stream[i+2] === 0x00 && stream[i+3] === 0x00) {
          const propOffset = stream[i+4] | (stream[i+5] << 8) | (stream[i+6] << 16) | (stream[i+7] << 24);
          if (propOffset > 0 && propOffset < stream.length - 8) {
            const valType = stream[propOffset] | (stream[propOffset+1] << 8);
            if (valType === 3) {
              const count = stream[propOffset+4] | (stream[propOffset+5] << 8) | (stream[propOffset+6] << 16) | (stream[propOffset+7] << 24);
              if (count > 0 && count < 1000) return count;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('CFB doc error:', err);
  }
  return 1;
}

function estimateTxtPages(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const len = (e.target?.result as string)?.length ?? 0;
      resolve(Math.max(1, Math.ceil(len / 3000)));
    };
    reader.onerror = () => resolve(1);
    reader.readAsText(file);
  });
}

/**
 * Returns the real page/slide count for the given file.
 * Always resolves (never rejects) — returns 1 on any error.
 */
export async function countPages(file: File): Promise<number> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  try {
    switch (ext) {
      case 'pdf':
        return await countViaPdfJs(file);

      case 'pptx':
      case 'pptm':
      case 'odp':
        return await countViaPptx(file);

      case 'ppt':
        return await countViaPpt(file);

      case 'docx':
      case 'docm':
      case 'odt':
        return await countViaDocx(file);

      case 'doc':
        return await countViaDoc(file);

      case 'txt':
      case 'rtf':
      case 'csv':
        return await estimateTxtPages(file);

      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'bmp':
      case 'tiff':
        return 1; // images always 1 page

      default:
        return 1;
    }
  } catch (err) {
    console.warn(`[countPages] Failed for ${file.name}:`, err);
    return 1;
  }
}
