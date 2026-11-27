#!/usr/bin/env node
/* k8s.js — o CLI dos autores: aplica o manifesto da caixa no motor e mostra o painel
 * (o que o kubectl responderia) ou o resultado da meta.
 *
 *   node tools/k8s.js pagina.html                      # todos os pre.yaml da página
 *   node tools/k8s.js pagina.html --meta "conta:pods=2"
 *   node tools/k8s.js --yaml "apiVersion: v1\nkind: Pod..."
 *   node tools/k8s.js --yaml "kubectl get pods" --modo terminal
 *   --json
 *
 * Sai com 1 quando a meta não é cumprida.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { abrir } = require("./compilar");
const N = require("./nucleo");

const args = process.argv.slice(2);
const valor = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i === -1 ? padrao : args[i + 1];
};
const opcoes = {
  meta: valor("--meta", ""),
  yaml: valor("--yaml", null),
  modo: valor("--modo", "manifesto"),
  json: args.includes("--json")
};
const arquivos = args.filter((a) => !a.startsWith("--") && !["--meta", "--yaml", "--modo"].includes(args[args.indexOf(a) - 1]));

function lerTrechos(arquivo) {
  const html = fs.readFileSync(arquivo, "utf8");
  const src = N.prepararHtml(html);
  const tags = N.varrer(src);
  const caixas = N.listar(tags, "div", (at) => N.temClasse(at, "tryk8s"));
  const caixaDe = (el) => caixas.find((c) => N.dentroDe(c, el.ini)) || null;
  return N.listar(tags, "pre", (at) => N.temClasse(at, "yaml")).map((b, i) => {
    const cx = caixaDe(b);
    const at = (cx && cx.at) || {};
    return {
      nome: path.basename(arquivo) + " #" + (i + 1),
      codigo: N.decodificarEntidades(src.slice(b.fimTag, b.fimEl ?? src.length)).replace(/^\n/, "").replace(/\s+$/, ""),
      modo: b.at["data-modo"] || at["data-modo"] || opcoes.modo,
      cenario: b.at["data-cenario"] || at["data-cenario"] || "",
      get: b.at["data-get"] || at["data-get"] || "",
      meta: at["data-goal"] || ""
    };
  });
}

(async () => {
  const trechos = opcoes.yaml
    ? [{ nome: "trecho", codigo: opcoes.yaml, modo: opcoes.modo, meta: "", cenario: "", get: "" }]
    : arquivos.flatMap(lerTrechos);
  if (!trechos.length) {
    console.error('uso: node tools/k8s.js pagina.html [--meta "conta:pods=2"] [--yaml "kubectl get pods" --modo terminal]');
    process.exit(2);
  }
  const nav = await abrir();
  let falhas = 0;
  for (const t of trechos) {
    const meta = opcoes.meta || t.meta;
    const extras = { cenario: t.cenario, get: t.get };
    if (meta) {
      const r = await nav.avaliar(t.codigo, meta, t.modo, extras);
      if (opcoes.json) console.log(JSON.stringify({ trecho: t.nome, ...r }, null, 1));
      else {
        console.log("== " + t.nome + ": " + (r.ok ? "meta cumprida" : "meta NÃO cumprida — " + r.motivo));
        console.log(r.saida);
      }
      if (!r.ok) falhas++;
      continue;
    }
    const r = await nav.rodar(t.codigo, t.modo, extras);
    console.log("== " + t.nome);
    console.log(r || "(nada)");
  }
  await nav.fechar();
  process.exit(falhas ? 1 : 0);
})();
