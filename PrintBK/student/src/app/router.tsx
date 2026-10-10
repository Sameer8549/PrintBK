import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';

import Splash from '../features/entry/Splash';
import Entry from '../features/entry/Entry';
import Uploading from '../features/entry/Uploading'; // wait, ui or entry?
import Basket from '../features/basket/Basket';
import EmptyBasket from '../features/basket/EmptyBasket';
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
import SettingsSheet from '../components/ui/SettingsSheet';
import PickerSheet from '../components/ui/PickerSheet';
import BreakdownSheet from '../features/pricing/BreakdownSheet';

function RouteMapper() {
  const navigate = useNavigate();
  // We simulate the 'go', 'setSheet' API of the old App.tsx to avoid massive rewrites immediately
  const go = (screen: string) => {
    const map: any = {
      entry: '/',
      basket: '/basket',
      empty: '/basket', // or empty specific
      services: '/services',
      photo: '/photos',
      checkout: '/checkout',
      confirming: '/pay/1',
      failed: '/pay/1?failed=true',
      paid: '/pay/1?success=true',
      ticket: '/order/1',
      quoteTicket: '/order/q1',
      orderError: '/order/1?error=true',
      history: '/history',
      settings: '/settings',
      uploading: '/uploading',
      preview: '/preview'
    };
    navigate(map[screen] || '/');
  };
  
  const [sheet, setSheet] = useState<string | null>(null);

  // Render current sheet if any
  const renderSheet = () => {
    switch (sheet) {
      case 'settings': return <SettingsSheet setSheet={setSheet as any} />;
      case 'picker': return <PickerSheet setSheet={setSheet as any} />;
      case 'breakdown': return <BreakdownSheet close={() => setSheet(null)} services={[]} />;
      case 'receipt': return <ReceiptSheet setSheet={setSheet as any} services={[]} />;
      case 'report': return <ReportSheet close={() => setSheet(null)} />;
      case 'binding': return <BindingSheet close={() => setSheet(null)} addService={()=>{}} initialType="Spiral" />;
      case 'lamination': return <LaminationSheet close={() => setSheet(null)} addService={()=>{}} />;
      case 'scanning': return <ScanningSheet close={() => setSheet(null)} addService={()=>{}} />;
      case 'typing': return <TypingSheet close={() => setSheet(null)} addService={()=>{}} />;
      case 'custom': return <CustomRequestSheet close={() => setSheet(null)} addService={()=>{}} initialNotes="" />;
      default: return null;
    }
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<Entry go={go} setSheet={setSheet} openPhoto={() => navigate('/photos')} />} />
        <Route path="/basket" element={<Basket go={go} setSheet={setSheet} services={[]} />} />
        <Route path="/services" element={<OtherServices go={go} setSheet={setSheet} addService={()=>{}} openBinding={()=>{}} openCustom={()=>{}} />} />
        <Route path="/photos" element={<PhotoTool go={go} initialLayout="3:4" />} />
        <Route path="/checkout" element={<Checkout go={go} setSheet={setSheet} services={[]} />} />
        <Route path="/history" element={<History go={go} />} />
        <Route path="/settings" element={<Settings go={go} />} />
        <Route path="/order/:id" element={<Ticket go={go} setSheet={setSheet} services={[]} />} />
        <Route path="/uploading" element={<Uploading go={go} />} />
        <Route path="/preview" element={<PrintPreview go={go} />} />
      </Routes>
      {renderSheet()}
    </>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteMapper />
    </BrowserRouter>
  );
}
