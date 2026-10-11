export const defaultShopConfig = {
  rates: {
    bw: 1.50,
    color: 8.00,
    scan: 5,
    photocopy: 1.50,
    doubleSideDiscount: 0.4333, // 1.50 -> 0.85
    bulkTierThreshold: 100,
    bulkTierRate: 0.80,
    paperMultipliers: { A4: 1, A3: 2, Legal: 1.2 },
    staple: 5,
    spiral: 30,
    comb: 25,
    hardCover: 150,
    laminationID: 10,
    laminationA4: 25,
    laminationA3: 50,
    laminationThickExtra: 5,
    rushSurcharge: 0.15,
    gatewayFee: 0
  },
  rushEnabled: false,
  maxFileMB: 25,
  autoDeleteDelay: 5
};
