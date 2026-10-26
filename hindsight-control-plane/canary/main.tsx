import React from "react";
import { createRoot } from "react-dom/client";
import { AiCostCard } from "../src/components/ai-cost-card";
import "../src/app/globals.css";

const query = new URLSearchParams(location.search);
const bankId = query.get("bank") || "memo.elus360";
const root = document.getElementById("root");
if (!root) throw new Error("Canary root not found");
createRoot(root).render(
  <main className="mx-auto max-w-5xl p-4 sm:p-8" data-testid="canary">
    <h1 className="text-xl font-semibold">Elus Memo — canário do card</h1>
    <AiCostCard bankId={bankId} enabled />
  </main>,
);
