'use client';

import dynamic from 'next/dynamic';
import type { ParcelleLecture } from './CarteLecture';

const CarteLecture = dynamic(() => import('./CarteLecture'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center text-muted">
      Chargement de la carte…
    </div>
  )
});

export default function CarteLectureLoader(props: {
  parcelles: ParcelleLecture[];
  hauteur?: string;
}) {
  return <CarteLecture {...props} />;
}
