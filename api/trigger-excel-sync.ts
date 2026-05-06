const ADMIN_EMAILS = ["afemos027@gmail.com", "afemos023@gmail.com", "daar.523@gmail.com"];

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const body = req.body as { email?: string };
    const email = body.email;

    if (!email || !ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const GITHUB_PAT = process.env.GITHUB_PAT;
    if (!GITHUB_PAT) {
      return res.status(500).json({ error: "GITHUB_PAT no configurado" });
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
      return res.status(200).json({ success: true, message: "Sincronización a Excel iniciada" });
    } else {
      const errText = await response.text();
      console.error("GitHub API error:", response.status, errText);
      return res.status(502).json({ error: `GitHub API respondió con ${response.status}` });
    }
  } catch (error: any) {
    console.error("Error en trigger-excel-sync:", error);
    return res.status(500).json({ error: error.message || "Error interno" });
  }
}
