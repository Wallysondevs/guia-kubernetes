#!/usr/bin/env node
/* empacotar.js — o leitor de YAML que o site usa é o MESMO que o autor usa.
 *
 *   node tools/empacotar.js --gerar     copia js-yaml (dist do navegador) para assets/js-yaml.js
 *                                       e grava assets/vendor.json (versão + sha)
 *   node tools/empacotar.js --checar    confere o que está publicado com o node_modules
 *
 * O guia não simula YAML com regex: usa o parser js-yaml, o mesmo do ecossistema Node.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ASSETS = path.join(RAIZ, "assets");
const DESTINO = path.join(ASSETS, "js-yaml.js");
const MANIFESTO = path.join(ASSETS, "vendor.json");
const ORIGEM = path.join(RAIZ, "node_modules/js-yaml/dist/js-yaml.min.js");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
const versao = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, "node_modules", p, "package.json"), "utf8")).version;

function gerar() {
  if (!fs.existsSync(ORIGEM)) {
    console.error("não achei node_modules/js-yaml/dist/js-yaml.min.js — rode: npm i -D js-yaml@4.1.0");
    process.exit(2);
  }
  const bytes = fs.readFileSync(ORIGEM);
  fs.writeFileSync(DESTINO, bytes);
  const manifesto = { jsyaml: versao("js-yaml"), arquivo: "js-yaml.js", sha: sha(bytes), bytes: bytes.length };
  fs.writeFileSync(MANIFESTO, JSON.stringify(manifesto, null, 2) + "\n");
  console.log("publicado assets/js-yaml.js (" + Math.round(bytes.length / 1024) + " KB, js-yaml " + manifesto.jsyaml + ")");
}

function checar() {
  if (!fs.existsSync(MANIFESTO) || !fs.existsSync(DESTINO)) {
    console.error("falta assets/js-yaml.js ou assets/vendor.json — rode --gerar");
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(MANIFESTO, "utf8"));
  const bytes = fs.readFileSync(DESTINO);
  let problemas = 0;
  if (sha(bytes) !== m.sha) { console.error("assets/js-yaml.js não é o arquivo do manifesto (sha mudou)"); problemas++; }
  else console.log("assets/js-yaml.js confere com o manifesto (" + Math.round(bytes.length / 1024) + " KB, sha " + m.sha + ")");
  const v = versao("js-yaml");
  if (v !== m.jsyaml) { console.error("o manifesto diz js-yaml " + m.jsyaml + " e o node_modules tem " + v + " — rode --gerar"); problemas++; }
  else console.log("js-yaml " + v + " confere com o node_modules");
  if (problemas) process.exit(1);
  console.log("motor do site confere com o do projeto.");
}

if (process.argv.includes("--gerar")) gerar();
else if (process.argv.includes("--checar")) checar();
else {
  console.error("uso: node tools/empacotar.js --gerar | --checar");
  process.exit(2);
}
