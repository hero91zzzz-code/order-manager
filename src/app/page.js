'use client';

import dynamic from 'next/dynamic';

const OrderManager = dynamic(() => import('@/components/OrderManager'), {
  ssr: false,
});

export default function Page() {
  return <OrderManager />;
}
