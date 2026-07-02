import 'server-only';

// Intégration Pennylane (facturation client) — API externe v2.
// Clé API : parametres.pennylaneApiKey (organisation) sinon PENNYLANE_API_KEY (env).
// Clé vide → MODE SIMULATION : aucune requête sortante, identifiants "sim_…",
// la facture est enregistrée localement avec statut SIMULEE.
// La numérotation légale, la TVA et les mentions sont gérées par Pennylane.

const API_BASE = 'https://app.pennylane.com/api/external/v2';

export type LigneFacture = {
  libelle: string;
  quantite: number;
  prixUnitaire: number; // HT
  unite?: string; // 'heure' | 'forfait' | ...
};

export function pennylaneKey(parametres: unknown): string | undefined {
  const p = parametres as { pennylaneApiKey?: string } | null;
  return p?.pennylaneApiKey || process.env.PENNYLANE_API_KEY || undefined;
}

export function estSimulation(parametres: unknown): boolean {
  return !pennylaneKey(parametres);
}

async function api(
  key: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

/**
 * Mapping client Krontrol ↔ Pennylane : crée le client chez Pennylane s'il
 * n'existe pas encore et renvoie son identifiant.
 */
export async function ensureCustomer(params: {
  parametres: unknown;
  client: { nom: string; email?: string | null; adresse?: string | null; telephone?: string | null; pennylaneCustomerId?: string | null };
}): Promise<string> {
  if (params.client.pennylaneCustomerId) return params.client.pennylaneCustomerId;
  const key = pennylaneKey(params.parametres);
  if (!key) return `sim_customer_${Date.now()}`;

  const res = await api(key, '/individual_customers', {
    method: 'POST',
    body: JSON.stringify({
      first_name: '',
      last_name: params.client.nom,
      emails: params.client.email ? [params.client.email] : [],
      phone: params.client.telephone ?? undefined,
      billing_address: params.client.adresse
        ? { address: params.client.adresse, postal_code: '', city: '', country_alpha2: 'FR' }
        : undefined
    })
  });
  if (!res.ok) {
    throw new Error(`Pennylane customer: HTTP ${res.status} ${JSON.stringify(res.json)}`);
  }
  return String(res.json?.id ?? res.json?.customer?.id);
}

/** Crée la facture (brouillon ou finalisée). Renvoie l'id Pennylane et le statut. */
export async function createInvoice(params: {
  parametres: unknown;
  customerId: string;
  lignes: LigneFacture[];
  brouillon: boolean;
  dateFacture: string; // YYYY-MM-DD
  libelle?: string;
}): Promise<{ id: string; statut: string }> {
  const key = pennylaneKey(params.parametres);
  if (!key) {
    return {
      id: `sim_invoice_${Date.now()}`,
      statut: 'SIMULEE'
    };
  }

  const res = await api(key, '/customer_invoices', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: params.customerId,
      date: params.dateFacture,
      deadline: params.dateFacture,
      draft: params.brouillon,
      label: params.libelle,
      invoice_lines: params.lignes.map((l) => ({
        label: l.libelle,
        quantity: l.quantite,
        raw_currency_unit_price: String(l.prixUnitaire),
        unit: l.unite ?? 'piece',
        vat_rate: 'FR_200' // TVA gérée par Pennylane, taux normal par défaut
      }))
    })
  });
  if (!res.ok) {
    throw new Error(`Pennylane invoice: HTTP ${res.status} ${JSON.stringify(res.json)}`);
  }
  return {
    id: String(res.json?.id ?? res.json?.invoice?.id),
    statut: params.brouillon ? 'BROUILLON' : 'FINALISEE'
  };
}

/** Synchronise le statut d'une facture (brouillon / envoyée / payée). */
export async function getInvoiceStatus(params: {
  parametres: unknown;
  invoiceId: string;
}): Promise<string | null> {
  const key = pennylaneKey(params.parametres);
  if (!key || params.invoiceId.startsWith('sim_')) return null; // simulation : statut inchangé

  const res = await api(key, `/customer_invoices/${params.invoiceId}`, { method: 'GET' });
  if (!res.ok) return null;
  const inv = res.json?.invoice ?? res.json;
  if (inv?.paid) return 'PAYEE';
  if (inv?.status === 'draft' || inv?.draft) return 'BROUILLON';
  return 'ENVOYEE';
}
