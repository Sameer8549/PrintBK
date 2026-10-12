import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const req = createRequire(path.resolve(__dirname, '../student/package.json'));
const { PDFDocument, rgb, degrees, StandardFonts } = req('pdf-lib');
const JSZip = req('jszip');
const fixturesDir = path.resolve(__dirname, '../test-fixtures');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// 1. Generate rotate-0-90-180-270.pdf
async function generateRotatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const rotations = [0, 90, 180, 270];

  for (let i = 0; i < rotations.length; i++) {
    const rot = rotations[i];
    const page = doc.addPage([595.28, 841.89]); // A4
    page.setRotation(degrees(rot));
    page.drawText(`Page ${i + 1} with /Rotate ${rot} deg`, {
      x: 100,
      y: 700,
      size: 24,
      font,
      color: rgb(0.1, 0.2, 0.4)
    });
    page.drawText(`Top edge of original orientation`, {
      x: 100,
      y: 750,
      size: 14,
      font,
      color: rgb(0.8, 0.1, 0.1)
    });
  }

  const bytes = await doc.save();
  const outPath = path.join(fixturesDir, 'rotate-0-90-180-270.pdf');
  fs.writeFileSync(outPath, bytes);
  console.log(`Generated: ${outPath} (${bytes.length} bytes)`);
}

// 2. Generate mixed-a4-a3.pdf
async function generateMixedSizePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Page 1: A4
  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawText('Page 1: A4 Standard (210 x 297 mm)', { x: 50, y: 800, size: 20, font });

  // Page 2: A3
  const p2 = doc.addPage([841.89, 1190.55]);
  p2.drawText('Page 2: A3 Large Sheet (297 x 420 mm)', { x: 50, y: 1100, size: 28, font });

  // Page 3: A4 Landscape
  const p3 = doc.addPage([841.89, 595.28]);
  p3.drawText('Page 3: A4 Landscape (297 x 210 mm)', { x: 50, y: 550, size: 20, font });

  const bytes = await doc.save();
  const outPath = path.join(fixturesDir, 'mixed-a4-a3.pdf');
  fs.writeFileSync(outPath, bytes);
  console.log(`Generated: ${outPath} (${bytes.length} bytes)`);
}

// 3. Generate sample-10page.pdf
async function generate10PagePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 10; i++) {
    const page = doc.addPage([595.28, 841.89]);
    // Make Page 1 and Page 5 visually colourful with colour shapes
    const isCol = (i === 1 || i === 5);
    page.drawText(`Document Page ${i} of 10`, {
      x: 60,
      y: 780,
      size: 24,
      font,
      color: isCol ? rgb(0.9, 0.2, 0.1) : rgb(0.2, 0.2, 0.2)
    });
    page.drawText(`This is a test paragraph for sheet ${i} verification in PrintBK.`, {
      x: 60,
      y: 740,
      size: 14,
      font
    });
    if (isCol) {
      page.drawRectangle({
        x: 60,
        y: 600,
        width: 200,
        height: 100,
        color: rgb(0.2, 0.6, 1.0)
      });
      page.drawText('Colour Content Badge', {
        x: 80,
        y: 645,
        size: 14,
        font,
        color: rgb(1, 1, 1)
      });
    }
  }

  const bytes = await doc.save();
  const outPath = path.join(fixturesDir, 'sample-10page.pdf');
  fs.writeFileSync(outPath, bytes);
  console.log(`Generated: ${outPath} (${bytes.length} bytes)`);
}

// 4. Generate mixed-slides.pptx
async function generateMixedSlidesPptx() {
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide4.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);

  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  // ppt/_rels/presentation.xml.rels
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide4.xml"/>
</Relationships>`);

  // ppt/presentation.xml (16:9 widescreen 12192000 x 6858000)
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <p:sldId id="257" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <p:sldId id="258" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <p:sldId id="259" r:id="rId4" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
</p:presentation>`);

  const createSlideXml = (title, bullet, rot = 0) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm ${rot ? `rot="${rot * 60000}"` : ''}/></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>${title}</a:t></a:r></a:p>
          <a:p><a:r><a:t>${bullet}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file('ppt/slides/slide1.xml', createSlideXml('Slide 1: 16:9 Landscape Title', 'Standard widescreen presentation introduction', 0));
  zip.file('ppt/slides/slide2.xml', createSlideXml('Slide 2: 4:3 Content Slide', 'Legacy standard aspect presentation slide', 0));
  zip.file('ppt/slides/slide3.xml', createSlideXml('Slide 3: Portrait Layout Document', 'Vertical orientation slide data sheet', 0));
  zip.file('ppt/slides/slide4.xml', createSlideXml('Slide 4: Rotated Slide 90 Deg', 'Slide containing 90 degree rotated content block', 90));

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const outPath = path.join(fixturesDir, 'mixed-slides.pptx');
  fs.writeFileSync(outPath, buf);
  console.log(`Generated: ${outPath} (${buf.length} bytes)`);
}

async function main() {
  await generateRotatedPdf();
  await generateMixedSizePdf();
  await generate10PagePdf();
  await generateMixedSlidesPptx();
  console.log('All test fixtures generated successfully in test-fixtures/');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
