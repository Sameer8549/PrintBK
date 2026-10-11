import React, { useState } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';

import Entry from '../features/entry/Entry';
import Uploading from '../features/entry/Uploading';
import Basket from '../features/basket/Basket';
import PrintPreview from '../features/preview/PrintPreview';
import OtherServices from '../features/services/OtherServices';
import PhotoTool from '../features/photos/PhotoTool';
import Checkout from '../features/checkout/Checkout';
import PaymentState from '../features/checkout/PaymentState';
import FailedPayment from '../features/checkout/FailedPayment';
import Ticket from '../features/order/Ticket';
import QuoteTicket from '../features/order/QuoteTicket';
import OrderError from '../features/order/OrderError';
import History from '../features/history/History';
import Settings from '../features/settings/Settings';
import ReceiptSheet from '../features/receipt/ReceiptSheet';
import ReportSheet from '../features/receipt/ReportSheet';
import BindingSheet from '../features/services/BindingSheet';
import LaminationSheet from '../features/services/LaminationSheet';
import ScanningSheet from '../features/services/ScanningSheet';
import TypingSheet from '../features/services/TypingSheet';
import CustomRequestSheet from '../features/services/CustomRequestSheet';
import BreakdownSheet from '../features/pricing/BreakdownSheet';
import PrivacyPolicy from '../features/settings/PrivacyPolicy';

import { useBasket } from '../store/basket';
import type { ServiceLine } from '@printbk/shared';

function RouteMapper() {
  const navigate = useNavigate();
  const basket = useBasket();

  const go = (screen: string) => {
    if (screen.startsWith('/')) return navigate(screen);
    const map: Record<string, string> = {
      entry: '/',
      basket: '/basket',
      empty: '/basket',
      services: '/services',
      photo: '/photos',
      checkout: '/checkout',
      quoteTicket: '/order/quote',
      orderError: '/order/error',
      history: '/history',
      settings: '/settings',
      uploading: '/uploading',
      preview: '/preview',
    };
    navigate(map[screen] || '/');
  };

  const [sheet, setSheet] = useState<string | null>(null);
  const [bindingType, setBindingType] = useState<string>("Spiral");
  const [customNote, setCustomNote] = useState<string>("");

  const addService = (s: any) => {
    basket.addService(s);
    setSheet(null);
    // Navigate to basket after adding so user can see it
    navigate('/basket');
  };

  const renderSheet = () => {
    switch (sheet) {
      case 'breakdown': return <BreakdownSheet close={() => setSheet(null)} />;
      case 'receipt':   return <ReceiptSheet setSheet={setSheet as any} services={basket.services as any} />;
      case 'report':    return <ReportSheet close={() => setSheet(null)} />;
      case 'binding':   return <BindingSheet close={() => setSheet(null)} addService={addService} initialType={bindingType} />;
      case 'lamination':return <LaminationSheet close={() => setSheet(null)} addService={addService} />;
      case 'scanning':  return <ScanningSheet close={() => setSheet(null)} addService={addService} />;
      case 'typing':    return <TypingSheet close={() => setSheet(null)} addService={addService} />;
      case 'custom':    return <CustomRequestSheet close={() => setSheet(null)} addService={addService} initialNotes={customNote} />;
      default: return null;
    }
  };

  return (
    <>
      <Routes>
        <Route path="/"          element={<Entry go={go} setSheet={setSheet} openPhoto={() => navigate('/photos')} />} />
        <Route path="/basket"    element={<Basket go={go} setSheet={setSheet} />} />
        <Route path="/services"  element={<OtherServices go={go} setSheet={setSheet} addService={addService} openBinding={(t) => { setBindingType(t); setSheet('binding'); }} openCustom={(t) => { setCustomNote(t); setSheet('custom'); }} />} />
        <Route path="/photos"    element={<PhotoTool go={go} initialLayout="Passport 8-up" />} />
        <Route path="/checkout"  element={<Checkout go={go} setSheet={setSheet} services={[]} />} />
        <Route path="/pay/:id"   element={<PaymentState go={go} />} />
        <Route path="/order/:id" element={<Ticket go={go} setSheet={setSheet} />} />
        <Route path="/history"   element={<History go={go} />} />
        <Route path="/settings"  element={<Settings go={go} />} />
        <Route path="/uploading" element={<Uploading go={go} />} />
        <Route path="/preview"   element={<PrintPreview go={go} />} />
        <Route path="/privacy"   element={<PrivacyPolicy go={go} />} />
        <Route path="*"          element={<Entry go={go} setSheet={setSheet} openPhoto={() => navigate('/photos')} />} />
      </Routes>
      {renderSheet()}
    </>
  );
}

export function AppRouter() {
  return (
    <HashRouter>
      <RouteMapper />
    </HashRouter>
  );
}
