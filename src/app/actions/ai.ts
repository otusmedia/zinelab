"use server";

function fallbackDescription(name: string) {
  const clean = name.trim();
  return [
    `${clean} — produto selecionado para quem busca qualidade e praticidade no dia a dia.`,
    "",
    "Destaques:",
    `• Ideal para uso cotidiano`,
    `• Acabamento pensado para durabilidade`,
    `• Pronto para envio conforme disponibilidade em estoque`,
    "",
    "Descrição sugerida automaticamente a partir do nome. Revise antes de publicar.",
  ].join("\n");
}

export async function generateProductDescription(name: string): Promise<{
  text?: string;
  error?: string;
  source?: "openai" | "template";
}> {
  const productName = name.trim();
  if (!productName) {
    return { error: "Informe o nome do produto antes de gerar a sugestão." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: fallbackDescription(productName), source: "template" };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "Você escreve descrições de produto para e-commerce brasileiro. Tom claro, persuasivo e honesto. Sem inventar especificações técnicas que não foram dadas. Responda só com a descrição, em português, 2 a 4 parágrafos curtos.",
          },
          {
            role: "user",
            content: `Gere uma descrição de venda para o produto chamado: "${productName}"`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return {
        text: fallbackDescription(productName),
        source: "template",
        error: `IA indisponível (${res.status}). Usamos sugestão padrão. ${detail.slice(0, 120)}`,
      };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { text: fallbackDescription(productName), source: "template" };
    }

    return { text, source: "openai" };
  } catch {
    return { text: fallbackDescription(productName), source: "template" };
  }
}
