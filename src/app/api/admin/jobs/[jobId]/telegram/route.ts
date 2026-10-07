import { isAdminAuthenticated } from "@/lib/auth";
import { getLatestDeliveryForJob, sendJobFileToTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Staff sign-in is required." }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: "Print job not found." }, { status: 404 });
  }

  let isRetry = false;
  try {
    const body = (await request.json().catch(() => ({}))) as { retry?: boolean };
    isRetry = Boolean(body?.retry);
  } catch {
    // Body optional
  }

  const result = await sendJobFileToTelegram(jobId, { forceRetry: isRetry });

  return Response.json(
    {
      success: result.success,
      delivery: result.delivery,
      error: result.error,
    },
    {
      status: result.success ? 200 : 200, // Return 200 with delivery record containing status="FAILED" so UI can display delivery error cleanly
      headers: { "Cache-Control": "no-store, no-cache" },
    },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Staff sign-in is required." }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: "Print job not found." }, { status: 404 });
  }

  const delivery = await getLatestDeliveryForJob(jobId);
  return Response.json(
    { delivery },
    { headers: { "Cache-Control": "no-store, no-cache" } },
  );
}
