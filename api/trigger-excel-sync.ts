const ADMIN_EMAILS = ["afemos027@gmail.com", "afemos023@gmail.com", "daar.523@gmail.com"];

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as { email?: string };
    const email = body.email;

    if (!email || !ADMIN_EMAILS.includes(email)) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const GITHUB_PAT = process.env.GITHUB_PAT;
    if (!GITHUB_PAT) {
      return new Response(JSON.stringify({ error: "GITHUB_PAT no configurado" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      "https://api.github.com/repos/Afemoos/La_polla_mundialista_2026/actions/workflows/sync_excel_manual.yml/dispatches",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${GITHUB_PAT}`,
          "User-Agent": "Vercel-Serverless-Function",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    );

    if (response.ok) {
      return new Response(JSON.stringify({ success: true, message: "Sincronización a Excel iniciada" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const errText = await response.text();
      console.error("GitHub API error:", response.status, errText);
      return new Response(JSON.stringify({ error: `GitHub API respondió con ${response.status}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Error en trigger-excel-sync:", error);
    return new Response(JSON.stringify({ error: error.message || "Error interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
