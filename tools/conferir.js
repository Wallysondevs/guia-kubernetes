#!/usr/bin/env node
/* conferir.js — prova que o motor do site responde como o Kubernetes de verdade.
 *
 * Para cada caso: aplica o manifesto num cluster real (kwok: kube-apiserver + scheduler +
 * controller-manager de verdade), captura a resposta do kubectl e compara com o que a caixa
 * do guia imprime. O que se compara:
 *
 *   erro       → a mensagem do API server, letra por letra
 *   apply      → a linha "deployment.apps/x created"
 *   pods       → READY e STATUS de cada pod (o painel não inventa status)
 *   defaults   → os campos que o API server preenche (estratégia, limites de revisão, ...)
 *   scheduler  → a mensagem do agendador quando nada cabe
 *   rbac       → a decisão do `kubectl auth can-i`
 *
 * Uso:  node tools/conferir.js            (todos os casos)
 *       node tools/conferir.js --cluster  (só diz se o cluster está no ar)
 *
 * Cluster de provas (uma vez):
 *   ~/bin/k8s/kwokctl create cluster --name guia --runtime binary
 *   ~/bin/k8s/kwokctl scale node --replicas 3 --name guia
 * e KUBECTL=~/bin/k8s/kubectl (ou kubectl no PATH).
 */
"use strict";

const { execFileSync, execSync } = require("child_process");
const os = require("os");
const path = require("path");
const { abrir } = require("./compilar");

const KUBECTL = process.env.KUBECTL || path.join(os.homedir(), "bin/k8s/kubectl");
const so = process.argv.includes("--cluster");

function kube(args, entrada) {
  try {
    const out = execFileSync(KUBECTL, args, { input: entrada || "", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, out: out, err: "" };
  } catch (e) {
    return { ok: false, out: (e.stdout || "").toString(), err: (e.stderr || "").toString() };
  }
}

/* ---------------------------------------------------------------- os casos */
const CASOS = [
  /* --- mensagens do API server: o motor tem de repetir a mesma frase -------- */
  {
    nome: "nome com maiúscula", tipo: "erro",
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: Ruim
spec:
  containers:
    - name: c
      image: nginx
`
  },
  {
    nome: "container sem imagem", tipo: "erro",
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: semimagem
spec:
  containers:
    - name: c
`
  },
  {
    nome: "selector não casa com o template", tipo: "erro",
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: errado
spec:
  replicas: 1
  selector:
    matchLabels:
      app: outro
  template:
    metadata:
      labels:
        app: cardapio
    spec:
      containers:
        - name: web
          image: nginx:1.29
`
  },
  {
    nome: "replicas negativo", tipo: "erro",
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: zero
spec:
  replicas: -1
  selector:
    matchLabels:
      app: zero
  template:
    metadata:
      labels:
        app: zero
    spec:
      containers:
        - name: c
          image: nginx
`
  },
  {
    nome: "apiVersion trocada", tipo: "erro",
    yaml: `apiVersion: v1
kind: Deployment
metadata:
  name: fora
spec:
  replicas: 1
  selector:
    matchLabels:
      app: x
  template:
    metadata:
      labels:
        app: x
    spec:
      containers:
        - name: c
          image: nginx
`
  },
  {
    nome: "nodePort fora da faixa", tipo: "erro",
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: fora
spec:
  type: NodePort
  selector:
    app: x
  ports:
    - port: 80
      nodePort: 80
`
  },
  {
    nome: "porta de container 70000", tipo: "erro",
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: porta
spec:
  containers:
    - name: c
      image: nginx
      ports:
        - containerPort: 70000
`
  },

  /* --- o apply com sucesso ------------------------------------------------- */
  {
    nome: "apply de Deployment", tipo: "apply",
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cardapio
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cardapio
  template:
    metadata:
      labels:
        app: cardapio
    spec:
      containers:
        - name: web
          image: nginx:1.29
          ports:
            - containerPort: 80
`
  },
  {
    nome: "apply de ConfigMap", tipo: "apply",
    yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: cardapio
data:
  preco: "4.50"
`
  },
  {
    nome: "apply de Ingress", tipo: "apply",
    yaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: loja
spec:
  rules:
    - host: loja.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: cardapio
                port:
                  number: 80
`
  },

  /* --- status dos pods ----------------------------------------------------- */
  {
    nome: "2 réplicas ficam Running", tipo: "pods",
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cardapio
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cardapio
  template:
    metadata:
      labels:
        app: cardapio
    spec:
      containers:
        - name: web
          image: nginx:1.29
`
  },
  {
    nome: "DaemonSet: um pod por nó", tipo: "pods",
    yaml: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: agente
spec:
  selector:
    matchLabels:
      app: agente
  template:
    metadata:
      labels:
        app: agente
    spec:
      tolerations:
        - operator: Exists
      containers:
        - name: agente
          image: agente:1.0
`
  },

  /* --- defaults do API server --------------------------------------------- */
  {
    nome: "defaults do Deployment", tipo: "defaults",
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: padrao
spec:
  selector:
    matchLabels:
      app: padrao
  template:
    metadata:
      labels:
        app: padrao
    spec:
      containers:
        - name: web
          image: nginx:1.29
`,
    campos: ["spec.replicas", "spec.revisionHistoryLimit", "spec.progressDeadlineSeconds", "spec.strategy.type", "spec.strategy.rollingUpdate.maxSurge", "spec.strategy.rollingUpdate.maxUnavailable", "spec.template.spec.restartPolicy", "spec.template.spec.dnsPolicy", "spec.template.spec.schedulerName", "spec.template.spec.terminationGracePeriodSeconds"]
  },
  {
    nome: "defaults do Pod", tipo: "defaults",
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: simples
spec:
  containers:
    - name: web
      image: nginx:1.29
`,
    campos: ["spec.restartPolicy", "spec.dnsPolicy", "spec.schedulerName", "spec.terminationGracePeriodSeconds", "spec.containers.0.imagePullPolicy"]
  },
  {
    nome: "defaults do Service", tipo: "defaults",
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
`,
    campos: ["spec.type", "spec.sessionAffinity", "spec.ports.0.protocol"]
  },
  {
    nome: "defaults do Job", tipo: "defaults",
    yaml: `apiVersion: batch/v1
kind: Job
metadata:
  name: tarefa
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: tarefa
          image: busybox
`,
    campos: ["spec.completions", "spec.parallelism", "spec.backoffLimit"]
  },

  /* --- agendador ---------------------------------------------------------- */
  {
    nome: "nada cabe (cpu)", tipo: "scheduler",
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: guloso
spec:
  containers:
    - name: c
      image: nginx
      resources:
        requests:
          cpu: "64"
`
  },
  {
    nome: "nodeSelector que não existe", tipo: "scheduler",
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: exigente
spec:
  nodeSelector:
    disco: ssd
  containers:
    - name: c
      image: nginx
`
  },

  /* --- RBAC --------------------------------------------------------------- */
  {
    nome: "service account sem permissão", tipo: "rbac",
    pre: [{ apiVersion: "v1", kind: "ServiceAccount", metadata: { name: "ana" } }],
    verbo: "get", recurso: "pods", quem: "system:serviceaccount:NS:ana"
  },
  {
    nome: "Role de leitura de pods", tipo: "rbac",
    pre: [
      { apiVersion: "v1", kind: "ServiceAccount", metadata: { name: "ana" } },
      { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", metadata: { name: "leitor" }, rules: [{ apiGroups: [""], resources: ["pods"], verbs: ["get", "list"] }] },
      { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding", metadata: { name: "leitor" }, subjects: [{ kind: "ServiceAccount", name: "ana" }], roleRef: { kind: "Role", name: "leitor", apiGroup: "rbac.authorization.k8s.io" } }
    ],
    verbo: "get", recurso: "pods", quem: "system:serviceaccount:NS:ana"
  },
  {
    nome: "Role de leitura não deixa apagar", tipo: "rbac",
    pre: [
      { apiVersion: "v1", kind: "ServiceAccount", metadata: { name: "ana" } },
      { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", metadata: { name: "leitor" }, rules: [{ apiGroups: [""], resources: ["pods"], verbs: ["get", "list"] }] },
      { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding", metadata: { name: "leitor" }, subjects: [{ kind: "ServiceAccount", name: "ana" }], roleRef: { kind: "Role", name: "leitor", apiGroup: "rbac.authorization.k8s.io" } }
    ],
    verbo: "delete", recurso: "pods", quem: "system:serviceaccount:NS:ana"
  }
];

/* -------------------------------------------------------------- utilidades */
const yamlParaDocs = (txt) => txt.split(/^---$/m).map((t) => t.trim()).filter(Boolean);

function nossoCluster(nav, caso, ns) {
  const docs = caso.pre ? caso.pre.concat(caso.yaml ? yamlParaDocs(caso.yaml).map((y) => require("js-yaml").load(y)) : []) : null;
  const codigo = caso.pre
    ? require("js-yaml").dump({ apiVersion: "v1", kind: "List", items: caso.pre })
    : caso.yaml;
  return codigo;
}

async function main() {
  const info = kube(["cluster-info"]);
  if (!info.ok) {
    console.error("o cluster de provas não está no ar. Suba com:");
    console.error("  ~/bin/k8s/kwokctl create cluster --name guia --runtime binary");
    console.error("  ~/bin/k8s/kwokctl scale node --replicas 3 --name guia");
    process.exit(2);
  }
  console.log("cluster de provas: ok (" + (info.out.match(/https:\/\/[^\s]+/) || ["?"])[0] + ")");
  if (so) return;

  const jsyaml = require("js-yaml");
  const nav = await abrir();
  let iguais = 0, diferentes = [];
  let indice = 0;

  for (const caso of CASOS) {
    indice++;
    const ns = "conf-" + indice;
    kube(["create", "namespace", ns]);
    let real = "", nosso = "", detalhe = "";

    if (caso.tipo === "erro" || caso.tipo === "apply" || caso.tipo === "pods" || caso.tipo === "defaults" || caso.tipo === "scheduler") {
      const r = kube(["apply", "-n", ns, "-f", "-"], caso.yaml);
      real = (r.out + r.err).trim();
      const codigo = caso.yaml.replace(/namespace: \S+/g, "");
      const painel = await nav.rodar(codigo, "manifesto", {});
      if (caso.tipo === "erro") {
        /* o real: 'The Pod "Ruim" is invalid: ...' — comparamos a frase inteira */
        nosso = painel.trim();
        real = real.replace(/^error: error when creating "STDIN": /, "").replace(/^Error from server \([A-Za-z]+\): error when creating "STDIN": /, "Error from server ($1): ");
        detalhe = real;
      } else if (caso.tipo === "apply") {
        nosso = painel.split("\n")[0].trim();
        real = real.split("\n")[0].trim();
        detalhe = real;
      } else if (caso.tipo === "pods") {
        const rp = kube(["get", "pods", "-n", ns, "--no-headers"]);
        const realPods = rp.out.trim().split("\n").filter(Boolean).map((l) => l.split(/\s+/).slice(1, 3).join(" "));
        await new Promise((r2) => setTimeout(r2, 1500));
        const painelPods = await nav.rodar(codigo, "manifesto", { get: "pods" });
        const nossoPods = painelPods.split("\n").filter((l) => /^\S+\s+\d\/\d\s+/.test(l)).map((l) => l.split(/\s+/).slice(1, 3).join(" "));
        real = realPods.sort().join(" | ");
        nosso = nossoPods.sort().join(" | ");
        detalhe = real;
      } else if (caso.tipo === "scheduler") {
        await new Promise((r2) => setTimeout(r2, 1500));
        const ev = kube(["get", "events", "-n", ns, "-o", "jsonpath={.items[*].message}"]);
        real = (ev.out.split("preemption:")[0] || "").trim();
        const nos = kube(["get", "nodes", "--no-headers"]).out.trim().split("\n").length;
        real = real.replace(/^0\/\d+ nodes are available/, "0/" + nos + " nodes are available");
        const estado = await nav.pg.evaluate((c) => window.__k8sEstado(c, "manifesto", {}), codigo);
        const falha = (estado.eventos || []).filter((e) => e.motivo === "FailedScheduling").pop();
        nosso = falha ? falha.msg.split("preemption:")[0].trim() : "(sem evento no painel)";
        nosso = nosso.replace(/^0\/\d+ nodes are available/, "0/" + nos + " nodes are available");
        detalhe = real;
      } else if (caso.tipo === "defaults") {
        const nome = (caso.yaml.match(/name: (\S+)/) || [])[1];
        const kind = (caso.yaml.match(/kind: (\S+)/) || [])[1];
        const rec = { Deployment: "deploy", Pod: "pod", Service: "svc", Job: "job" }[kind];
        const rj = kube(["get", rec, nome, "-n", ns, "-o", "json"]);
        const objReal = JSON.parse(rj.out);
        const est = await nav.avaliar(codigo, "texto:zzz", "manifesto", {});
        const painel = await nav.rodar(codigo, "manifesto", {});
        const estado = await nav.pg.evaluate((c) => window.__k8sEstado(c, "manifesto", {}), codigo);
        const objNosso = estado.objs.filter((o) => o.kind === kind)[0];
        const pares = caso.campos.map((campo) => {
          const ler = (o) => campo.split(".").reduce((x, k) => (x == null ? undefined : x[/^\d+$/.test(k) ? Number(k) : k]), o);
          return { campo, real: ler(objReal), nosso: ler(objNosso) };
        });
        const ruins = pares.filter((p) => JSON.stringify(p.real) !== JSON.stringify(p.nosso));
        real = pares.map((p) => p.campo + "=" + JSON.stringify(p.real)).join(" ");
        nosso = pares.map((p) => p.campo + "=" + JSON.stringify(p.nosso)).join(" ");
        detalhe = ruins.length ? "divergem: " + ruins.map((r3) => r3.campo + " (real " + JSON.stringify(r3.real) + ", motor " + JSON.stringify(r3.nosso) + ")").join("; ") : "";
      }
    } else if (caso.tipo === "rbac") {
      /* cria SA, role e binding no cluster real */
      const docs = caso.pre.map((d) => jsyaml.dump(d)).join("---\n");
      kube(["apply", "-n", ns, "-f", "-"], docs);
      const r = kube(["auth", "can-i", caso.verbo, caso.recurso, "-n", ns, "--as=" + caso.quem.replace("NS", ns)]);
      real = (r.out + r.err).trim().split("\n").filter((l) => /^(yes|no)$/.test(l.trim()))[0] || (r.out + r.err).trim();
      /* no motor: tudo no namespace default */
      const codigo = caso.pre.map((d) => jsyaml.dump(d)).join("---\n");
      const resp = await nav.pg.evaluate(({ c, quem, verbo, recurso }) => {
        const r2 = window.__k8sEstado(c, "manifesto", {});
        return window.K8sSim.podeFazer({ objs: r2.objs, eventos: r2.eventos, nos: r2.nos }, quem, verbo, recurso, "default").permitido ? "yes" : "no";
      }, { c: codigo, quem: caso.quem.replace("NS", "default"), verbo: caso.verbo, recurso: caso.recurso });
      nosso = resp;
      detalhe = real;
    }

    const igual = String(real).trim() === String(nosso).trim();
    if (igual) iguais++;
    else diferentes.push({ caso: caso.nome, tipo: caso.tipo, real: real.slice(0, 220), nosso: nosso.slice(0, 220), detalhe });
    if (process.argv.includes("--verboso")) {
      console.log((igual ? "✓ " : "✗ ") + caso.nome + (igual ? "" : "\n   real:  " + real + "\n   motor: " + nosso));
    }
    kube(["delete", "namespace", ns, "--wait=false"]);
  }

  await nav.fechar();
  console.log("");
  if (diferentes.length) {
    console.log("DIVERGÊNCIAS (" + diferentes.length + " de " + CASOS.length + "):");
    diferentes.forEach((d) => {
      console.log("  ✗ " + d.caso + " [" + d.tipo + "]");
      console.log("     real:  " + d.real);
      console.log("     motor: " + d.nosso);
      if (d.detalhe && d.detalhe.indexOf("divergem") === 0) console.log("     " + d.detalhe);
    });
  }
  console.log("conferidos com o cluster real: " + iguais + "/" + CASOS.length + " iguais.");
  process.exit(diferentes.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
