export async function GET() {
  return Response.json({ status: 'ok', app: 'superabang', milestone: 'M1', phase: 'B12_HARDENING_CUTOVER_READINESS' });
}
