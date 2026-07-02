'use client';

// Leaflet manipule window/document → chargement client uniquement (ssr: false).
import dynamic from 'next/dynamic';
import type { ClientCarte } from './carte-admin';

const CarteAdmin = dynamic(() => import('./carte-admin'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-110px)] items-center justify-center text-muted">
      Chargement de la carte…
    </div>
  )
});

export default function CarteLoader(props: {
  clients: ClientCarte[];
  dateAffectation: string;
}) {
  return <CarteAdmin {...props} />;
}
