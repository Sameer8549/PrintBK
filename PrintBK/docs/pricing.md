# PrintBK Single Source of Truth Pricing Architecture

## Overview

Pricing calculations in PrintBK are centralized in `@printbk/shared` (`packages/shared/src/pricing.ts`). Both the frontend React client and the backend Node.js Catalyst functions import and execute this identical code without duplication or drift.

---

## Authoritative Rate Table

| Item | Base Rate (A4) | Notes |
| :--- | :--- | :--- |
| **B&W Single-Sided** | ₹1.50 / page | Standard 1-sided B&W print |
| **B&W Double-Sided** | ₹0.85 / page | Duplex discount applied per page |
| **Color Single-Sided**| ₹8.00 / page | Full color print |
| **Color Double-Sided**| ₹8.00 / page | Full color duplex print |
| **Bulk B&W Rate** | ₹0.80 / page | Automatically triggered at **≥ 100 sheets** |
| **Paper Multiplier (A3)** | 2.0 × base | Large format |
| **Paper Multiplier (Legal)**| 1.2 × base | Legal format |
| **Rush Surcharge** | +15% of subtotal | Applies when rush toggle is enabled in config |

### Addon & Walk-in Services:
- **Corner Stapling**: ₹5.00
- **Spiral Binding**: ₹30.00
- **Comb Binding**: ₹25.00
- **Hard Cover Book**: ₹150.00
- **ID Card Lamination**: ₹10.00
- **A4 Lamination**: ₹25.00
- **A3 Lamination**: ₹50.00
- **Photocopy**: ₹1.50 / copy
- **Document Scan**: ₹5.00 / page

---

## Calculation Rules & Formulas

### 1. Physical Page Calculation
$$\text{physicalPages} = \left\lceil \frac{\text{pages}}{\text{nUp}} \right\rceil$$

For **Booklet** printing:
$$\text{physicalPages} = \left\lceil \frac{\text{pages}}{4} \right\rceil \times 2$$

### 2. Sheet Calculation (Duplex)
$$\text{sheets} = \begin{cases} \text{physicalPages} & \text{if single-sided} \\ \left\lceil \frac{\text{physicalPages}}{2} \right\rceil & \text{if double-sided} \end{cases}$$
$$\text{totalSheets} = \text{sheets} \times \text{copies}$$

### 3. Bulk Tier Qualification
If $\text{totalSheets} \ge 100$:
$$\text{pricePerPageBW} = \min(\text{pricePerPageBW}, 0.80 \times \text{paperMultiplier})$$

### 4. Color Detection & Mixed Ratios
When color mode is set to `'auto'`:
$$\text{colorPages} = \left\lceil \text{physicalPages} \times \frac{\text{detectedColorPages}}{\text{totalPages}} \right\rceil$$
$$\text{bwPages} = \text{physicalPages} - \text{colorPages}$$
$$\text{cost} = (\text{bwPages} \times \text{rate}_{\text{BW}} + \text{colorPages} \times \text{rate}_{\text{Color}}) \times \text{copies}$$

---

## Golden Test Vectors Suite

PrintBK includes 110 deterministic test vectors in `packages/shared/test-vectors/pricing.json`.
The automated suite (`packages/shared/src/pricing.test.ts`) executes across all 110 vectors, validating:
1. Subtotal precision to $\le 0.01\text{ INR}$.
2. Total precision to $\le 0.01\text{ INR}$.
3. Bulk tier boundary transitions at 99, 100, and 101 sheets.
4. Rush surcharge rounding to nearest 50 paise.
5. Quote pending flagging for custom unpriced requests.

Run the test suite with:
```bash
pnpm --filter @printbk/shared test
```
