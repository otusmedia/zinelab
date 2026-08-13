"use client";

import { useState, useTransition } from "react";
import { createProductAction } from "@/app/actions/products";
import { generateProductDescription } from "@/app/actions/ai";

export function ProductCreateForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "suggested" | "custom">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    setMessage(null);
    startTransition(async () => {
      const result = await generateProductDescription(name);
      if (result.error && !result.text) {
        setMessage(result.error);
        return;
      }
      if (result.text) {
        setSuggestion(result.text);
        setMode("suggested");
        if (result.error) setMessage(result.error);
        else if (result.source === "template") {
          setMessage(
            "Sugestão gerada localmente (sem OPENAI_API_KEY). Você pode usar ou escrever a sua.",
          );
        } else {
          setMessage("Sugestão gerada. Escolha usar ou escrever a sua.");
        }
      }
    });
  }

  function useSuggestion() {
    if (!suggestion) return;
    setDescription(suggestion);
    setMode("suggested");
    setMessage("Sugestão aplicada. Você ainda pode editar o texto.");
  }

  function writeOwn() {
    setDescription("");
    setMode("custom");
    setMessage("Escreva sua própria descrição abaixo.");
  }

  return (
    <form action={createProductAction}>
      <div className="field">
        <label className="label" htmlFor="name">
          Nome
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={handleGenerate} disabled={pending || !name.trim()}>
            {pending ? "Gerando…" : "Gerar descrição sugerida"}
          </button>
          {suggestion ? (
            <>
              <button type="button" onClick={useSuggestion}>
                Usar sugestão
              </button>
              <button type="button" onClick={writeOwn}>
                Escrever nova
              </button>
            </>
          ) : null}
        </div>

        {suggestion && mode !== "custom" ? (
          <div className="panel" style={{ marginBottom: 12, background: "#f5f5f5" }}>
            <div className="muted" style={{ marginBottom: 8 }}>
              Sugestão
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                margin: 0,
                fontFamily: "inherit",
              }}
            >
              {suggestion}
            </pre>
          </div>
        ) : null}

        {message ? <p className="muted">{message}</p> : null}

        <label className="label" htmlFor="description">
          Descrição {mode === "custom" ? "(sua versão)" : "(final)"}
        </label>
        <textarea
          id="description"
          name="description"
          rows={6}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setMode("custom");
          }}
          placeholder="Use a sugestão ou escreva a sua descrição"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="sku">
          SKU (variante)
        </label>
        <input id="sku" name="sku" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="variant_name">
          Nome da variante
        </label>
        <input id="variant_name" name="variant_name" placeholder="Padrão" />
      </div>
      <div className="field">
        <label className="label" htmlFor="price">
          Preço
        </label>
        <input id="price" name="price" type="number" step="0.01" defaultValue={0} />
      </div>
      <div className="field">
        <label className="label" htmlFor="quantity">
          Estoque inicial (loja padrão)
        </label>
        <input id="quantity" name="quantity" type="number" defaultValue={0} />
      </div>
      <div className="field">
        <label className="label" htmlFor="reorder_point">
          Ponto de reposição
        </label>
        <input
          id="reorder_point"
          name="reorder_point"
          type="number"
          defaultValue={0}
        />
      </div>
      <button type="submit" className="primary">
        Criar produto
      </button>
    </form>
  );
}
