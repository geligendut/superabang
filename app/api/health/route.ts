export async function GET() {
  return Response.json({
    status: 'ok',
    app: 'superabang',
    milestone: 'M1',
    phase: 'B13_CANONICAL_CURRENT',
    canonicalCutoverPerformed: true,
  });
}
