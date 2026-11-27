#!/usr/bin/env node
/* provar-defeitos.js — prova que o testador REPROVA quando o guia tem defeito.
 *
 * Um testador que só diz "ok" não serve para nada. Este script pega a aula-modelo
 * (primeiro-pod.html), injeta um defeito de cada vez numa cópia em tmp/defeitos/ e chama o
 * testador de verdade. Se o testador NÃO reprovar, é o testador que está errado.
 *
 *   node tools/provar-defeitos.js            roda todos os defeitos
 *   node tools/provar-defeitos.js -v         mostra a saída do testador em cada caso
 *
 * Sai com 1 se algum defeito passar batido.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");
const N = require("./nucleo");

const RAIZ = N.RAIZ;
const MODELO = path.join(RAIZ, "primeiro-pod.html");
const PASTA = path.join(RAIZ, "tmp/defeitos");
const verboso = process.argv.includes("-v") || process.argv.includes("--verboso");

const CAIXA = '<div class="tryk8s"';
const PAGER = '<div class="pager"></div>';

/* troca a meta de uma caixa, achando pelo começo do HTML dela */
function comMeta(html, inicioDoHtml, novaMeta) {
  const i = html.indexOf(inicioDoHtml);
  if (i < 0) throw new Error("não achei o pre.html: " + inicioDoHtml.slice(0, 50));
  const j = html.lastIndexOf("<div class=\"trytailwind\"", i);
  const k = html.indexOf("data-goal=\"", j);
  const fim = html.indexOf("\"", k + 11);
  return html.slice(0, k) + 'data-goal="' + novaMeta + html.slice(fim);
}

const DEFEITOS = [
  {
    nome: "sem doctype",
    espera: /doctype/i,
    html: (h) => h.replace("<!doctype html>\n", ""),
    semSim: true
  },
  {
    nome: "lang errado",
    espera: /pt-BR/,
    html: (h) => h.replace('lang="pt-BR"', 'lang="en"'),
    semSim: true
  },
  {
    nome: "title sem | Guia Kubernetes",
    espera: /\| Guia Kubernetes/,
    html: (h) => h.replace(/\| Guia Kubernetes<\/title>/, "— Kubernetes</title>"),
    semSim: true
  },
  {
    nome: "meta description curta",
    espera: /description/,
    html: (h) => h.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="curta">'),
    semSim: true
  },
  {
    nome: "caixa sem pre.solucao",
    espera: /solucao|solução/i,
    html: (h) => h.replace(/<pre class="solucao">[\s\S]*?<\/pre>/, "")
  },
  {
    nome: "caixa sem data-goal",
    espera: /data-goal/,
    html: (h) => h.replace(' data-goal="conta:pods=1;;campo:Pod/cardapio|spec.containers.0.image=cardapio:1.0;;texto:Running"', ""),
    semSim: true
  },
  {
    nome: "passo de meta desconhecido",
    espera: /passo de meta desconhecido/,
    html: (h) => h.replace('data-goal="conta:pods=1;;campo:Pod/cardapio|spec.containers.0.image=cardapio:1.0;;texto:Running"', 'data-goal="status:200"'),
    semSim: true
  },
  {
    nome: "meta que o inicial já cumpre",
    espera: /INICIAL já cumpre/,
    html: (h) => h.replace('kubectl run cardapio --image=nginx:1.29', 'kubectl run cardapio --image=cardapio:1.0')
  },
  {
    nome: "caixa sem pre.out",
    espera: /pre\.out/,
    html: (h) => {
      const i = h.indexOf('<pre class="out">');
      const j = h.indexOf("</pre>", i);
      return h.slice(0, i) + h.slice(j + 6);
    },
    semSim: true
  },
  {
    nome: "< sem escape dentro de pre.yaml",
    espera: /&lt;|escape/,
    html: (h) => h.replace('      image: nginx:1.29\n      ports:', '      image: nginx:1.29\n      <ports>:'),
    semSim: true
  },
  {
    nome: "menos de 3 caixas",
    espera: /3 caixa|caixa\(s\)/,
    html: (h) => h
      .replace('<div class="tryk8s" data-modo="terminal" data-goal="texto:Status:', '<div class="caixa" data-modo="terminal" data-goal="texto:Status:')
      .replace('<div class="tryk8s" data-goal="objeto:Pod/cardapio;;texto:Running">', '<div class="caixa" data-goal="objeto:Pod/cardapio;;texto:Running">')
      .replace('<div class="tryk8s" data-goal="texto:Running;;campo:Pod/forno', '<div class="caixa" data-goal="texto:Running;;campo:Pod/forno'),
    semSim: true
  },
  {
    nome: "só 1 table.ref",
    espera: /table\.ref/,
    html: (h) => h.replace(/<div class="table-wrap">[\s\S]*?<\/div>\s*/, ""),
    semSim: true
  },
  {
    nome: "sem dl.anatomy",
    espera: /dl\.anatomy/,
    html: (h) => h.replace(/<dl class="anatomy">[\s\S]*?<\/dl>/g, ""),
    semSim: true
  },
  {
    nome: "sem cenários",
    espera: /cenário|cenario/,
    html: (h) => h.replace(/<div class="cenario">[\s\S]*?<\/div>\s*<\/div>/g, ""),
    semSim: true
  },
  {
    nome: "h2 fora da numeração",
    espera: /numerados/,
    aviso: true,
    html: (h) => {
      const novo = h.replace("<h2>2. O que é um pod, na prática</h2>", "<h2>O que é um pod, na prática</h2>");
      if (novo === h) throw new Error("não achei o h2 2");
      return novo;
    },
    semSim: true
  },
  {
    nome: "privacidade: nome do dono da máquina",
    espera: /dono da máquina|proibid/i,
    html: (h) => h.replace("A Ana já sabe que o Kubernetes existe", "O Wallyson já sabe que o Kubernetes existe"),
    semSim: true
  }
];

function rodarTestador(arquivo, semSim) {
  const env = Object.assign({}, process.env, {
    PATH: path.dirname(process.execPath) + ":" + process.env.PATH,
    NODE_PATH: process.env.NODE_PATH || path.join(os.homedir(), "guia-kubernetes-novo/node_modules")
  });
  const comando = ["tools/testar-missoes.js", arquivo].concat(semSim ? ["--sem-sim"] : []);
  const r = cp.spawnSync(process.execPath, comando, { cwd: RAIZ, env, encoding: "utf8", timeout: 240000 });
  return { saida: (r.stdout || "") + (r.stderr || ""), codigo: r.status };
}

function principal() {
  if (!fs.existsSync(MODELO)) {
    console.error("não achei a aula-modelo: " + MODELO);
    process.exit(2);
  }
  const original = fs.readFileSync(MODELO, "utf8");
  fs.mkdirSync(PASTA, { recursive: true });

  let passaram = 0;
  console.log("provando " + DEFEITOS.length + " defeitos contra o testador (fonte: primeiro-pod.html)\n");

  DEFEITOS.forEach((d, k) => {
    const nome = "d" + String(k + 1).padStart(2, "0") + "-" + d.nome.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
    const arq = path.join(PASTA, nome + ".html");
    let html;
    try {
      html = d.html(original);
    } catch (e) {
      console.log("✗ " + d.nome + ": o defeito não pôde ser injetado — " + e.message);
      return;
    }
    if (html === original) {
      console.log("✗ " + d.nome + ": a injeção não mudou nada (defeito mal escrito)");
      return;
    }
    fs.writeFileSync(arq, html);
    const relativo = path.relative(RAIZ, arq);
    const r = rodarTestador(relativo, d.semSim === true);
    const pegou = d.aviso
      ? r.codigo === 0 && d.espera.test(r.saida)
      : r.codigo === 1 && d.espera.test(r.saida);
    if (pegou) {
      passaram++;
      console.log("✓ " + d.nome + " — reprovado como devia");
    } else {
      console.log("✗ " + d.nome + " — PASSOU BATIDO (código " + r.codigo + ")");
      if (verboso) console.log(r.saida.split("\n").slice(-14).join("\n"));
      else console.log("   rode com -v para ver a saída do testador");
    }
  });

  console.log("");
  console.log(passaram + " de " + DEFEITOS.length + " defeitos reprovados");
  if (passaram < DEFEITOS.length) {
    console.log("o testador deixou passar defeito: conserte a REGRA, não o defeito.");
    process.exit(1);
  }
  console.log("o testador está afiado.");
}

principal();
