import React from 'react';

const items = [
  {title:'CAVIAR С 2011 ГОДА', text:'Кастомизированная продукция ведущих брендов с 2011 года.', icon:<><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5.5-6"/></>},
  {title:'ГАРАНТИЯ КАЧЕСТВА', text:'Гарантия на продукцию Caviar — 1 год.', icon:<><path d="M12 2l7 3v6c0 5-3 8-7 11-4-3-7-6-7-11V5l7-3z"/><path d="M9 12l2 2 4-4"/></>},
  {title:'БЕСПЛАТНАЯ ДОСТАВКА', text:'По Москве и всей России.', icon:<><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>},
  {title:'ОРИГИНАЛЬНАЯ ПРОДУКЦИЯ', text:'Продукция от официальных поставщиков. iPhone можно проверить по IMEI.', icon:<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></>},
];
export default function OrderBenefits(){return <section className="order-benefits" aria-label="Преимущества Caviar">{items.map(item=><div className="order-benefit" key={item.title}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</section>}
