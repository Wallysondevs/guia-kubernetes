/* =====================================================================
   Guia Kubernetes — motor do cluster no navegador (assets/k8ssim.js)
   ---------------------------------------------------------------------
   Não é um kubectl de mentira com respostas prontas: o manifesto YAML do
   leitor é lido, validado com as MENSAGENS DO API SERVER (conferidas com o
   kube-apiserver de verdade em tools/conferir.js), recebe os mesmos
   defaults e passa pelos controladores (Deployment → ReplicaSet → Pod,
   Service → Endpoints, DaemonSet, StatefulSet, Job, CronJob, HPA).
   O painel imprime o que o kubectl imprime: apply, get, describe, logs,
   rollout e os erros.

   Limites assumidos (e ditos nas aulas): não há kubelet nem rede de
   verdade por aqui — status de container (Running/CrashLoop), logs da
   aplicação e "FailedMount" vêm do cenário semeado, não de execução real.
   ===================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ util */
  var VERSAO = "v1.37.3";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }
  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* hash estável de string → base36 curto (o "sufixo" dos nomes do k8s) */
  function hash36(s, n) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    var out = "";
    for (var k = 0; k < n; k++) {
      h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
      out += "bcdfghjklmnpqrstvwxz2456789".charAt(h % 27);
    }
    return out;
  }

  /* a idade que o kubectl imprime é determinística aqui (o painel não envelhece) */
  function idade(seg) {
    if (seg < 60) return seg + "s";
    var m = Math.floor(seg / 60);
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h";
    var d = Math.floor(h / 24);
    if (d < 365) return d + "d";
    return Math.floor(d / 365) + "y";
  }
  function idadeDo(nome) { return idade(20 + (parseInt(hash36(nome, 3), 36) % 600)); }

  /* --------------------------------------------------------------- YAML */
  function yamlCarregar(texto) {
    if (!window.jsyaml || !window.jsyaml.loadAll) {
      return { erro: "o leitor de YAML não carregou (assets/js-yaml.js)", docs: [] };
    }
    var docs = [];
    try {
      window.jsyaml.loadAll(texto, function (d) { if (d != null) docs.push(d); });
    } catch (e) {
      return { erro: String(e.reason || e.message || e).split("\n")[0], docs: [] };
    }
    return { erro: null, docs: docs };
  }

  /* -------------------------------------------------- catálogo de recursos */
  /* plural, kind, apiversão aceita, escopo de namespace, shortnames */
  var RECURSOS = [
    { plural: "pods", singular: "pod", kind: "Pod", api: "v1", ns: true, curto: ["po"] },
    { plural: "deployments", singular: "deployment", kind: "Deployment", api: "apps/v1", ns: true, curto: ["deploy"] },
    { plural: "replicasets", singular: "replicaset", kind: "ReplicaSet", api: "apps/v1", ns: true, curto: ["rs"] },
    { plural: "statefulsets", singular: "statefulset", kind: "StatefulSet", api: "apps/v1", ns: true, curto: ["sts"] },
    { plural: "daemonsets", singular: "daemonset", kind: "DaemonSet", api: "apps/v1", ns: true, curto: ["ds"] },
    { plural: "jobs", singular: "job", kind: "Job", api: "batch/v1", ns: true, curto: [] },
    { plural: "cronjobs", singular: "cronjob", kind: "CronJob", api: "batch/v1", ns: true, curto: ["cj"] },
    { plural: "services", singular: "service", kind: "Service", api: "v1", ns: true, curto: ["svc"] },
    { plural: "endpoints", singular: "endpoints", kind: "Endpoints", api: "v1", ns: true, curto: ["ep"] },
    { plural: "endpointslices", singular: "endpointslice", kind: "EndpointSlice", api: "discovery.k8s.io/v1", ns: true, curto: [] },
    { plural: "ingresses", singular: "ingress", kind: "Ingress", api: "networking.k8s.io/v1", ns: true, curto: ["ing"] },
    { plural: "networkpolicies", singular: "networkpolicy", kind: "NetworkPolicy", api: "networking.k8s.io/v1", ns: true, curto: ["netpol"] },
    { plural: "configmaps", singular: "configmap", kind: "ConfigMap", api: "v1", ns: true, curto: ["cm"] },
    { plural: "secrets", singular: "secret", kind: "Secret", api: "v1", ns: true, curto: [] },
    { plural: "persistentvolumeclaims", singular: "persistentvolumeclaim", kind: "PersistentVolumeClaim", api: "v1", ns: true, curto: ["pvc"] },
    { plural: "persistentvolumes", singular: "persistentvolume", kind: "PersistentVolume", api: "v1", ns: false, curto: ["pv"] },
    { plural: "storageclasses", singular: "storageclass", kind: "StorageClass", api: "storage.k8s.io/v1", ns: false, curto: ["sc"] },
    { plural: "horizontalpodautoscalers", singular: "horizontalpodautoscaler", kind: "HorizontalPodAutoscaler", api: "autoscaling/v2", ns: true, curto: ["hpa"] },
    { plural: "serviceaccounts", singular: "serviceaccount", kind: "ServiceAccount", api: "v1", ns: true, curto: ["sa"] },
    { plural: "roles", singular: "role", kind: "Role", api: "rbac.authorization.k8s.io/v1", ns: true, curto: [] },
    { plural: "rolebindings", singular: "rolebinding", kind: "RoleBinding", api: "rbac.authorization.k8s.io/v1", ns: true, curto: [] },
    { plural: "clusterroles", singular: "clusterrole", kind: "ClusterRole", api: "rbac.authorization.k8s.io/v1", ns: false, curto: [] },
    { plural: "clusterrolebindings", singular: "clusterrolebinding", kind: "ClusterRoleBinding", api: "rbac.authorization.k8s.io/v1", ns: false, curto: [] },
    { plural: "namespaces", singular: "namespace", kind: "Namespace", api: "v1", ns: false, curto: ["ns"] },
    { plural: "nodes", singular: "node", kind: "Node", api: "v1", ns: false, curto: ["no"] },
    { plural: "events", singular: "event", kind: "Event", api: "v1", ns: true, curto: ["ev"] }
  ];

  function recursoPorNome(n) {
    /* aceita pods, pod, po e também a forma do kubectl (deployment.apps) */
    var t = String(n || "").toLowerCase();
    if (t.indexOf(".") > 0) t = t.split(".")[0];
    return RECURSOS.filter(function (r) {
      return r.plural === t || r.singular === t || r.kind.toLowerCase() === t ||
        r.curto.some(function (c) { return c === t; });
    })[0] || null;
  }

  /* ------------------------------------------------------ regex do API server */
  var RFC1123 = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
  var RFC1123_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  var ERRO_RFC1123 = "a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character (e.g. 'example.com', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*')";
  var ERRO_LABEL = "a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name',  or '123-abc', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?')";

  /* ------------------------------------------------------- validação por kind */
  /* cada regra devolve uma lista de "campo: mensagem", no formato do API server */
  function vNome(obj, erros) {
    var nome = obj.metadata && obj.metadata.name;
    if (!nome) { erros.push("metadata.name: Required value"); return; }
    if (typeof nome !== "string") { erros.push("metadata.name: Invalid value: " + JSON.stringify(nome) + ": must be a string"); return; }
    if (!RFC1123.test(nome) || nome.length > 253) {
      erros.push('metadata.name: Invalid value: "' + nome + '": ' + ERRO_RFC1123);
    }
  }

  function vLabels(obj, campo, erros) {
    var l = obj && obj[campo] && obj[campo].labels;
    if (l == null) return;
    Object.keys(l).forEach(function (k) {
      if (!RFC1123_LABEL.test(k) && k.length > 63) erros.push(campo + ".labels: Invalid value: \"" + k + "\": name part must be no more than 63 characters");
      if (typeof l[k] === "number" || typeof l[k] === "boolean") {
        erros.push(campo + ".labels: Invalid value: \"" + l[k] + "\": must be a string");
      }
    });
  }

  function vContainers(spec, prefixo, erros) {
    var cs = spec && spec.containers;
    if (!cs || !cs.length) { erros.push(prefixo + ".containers: Required value"); return; }
    if (!Array.isArray(cs)) { erros.push(prefixo + ".containers: Invalid value: must be a list"); return; }
    cs.forEach(function (c, i) {
      var p = prefixo + ".containers[" + i + "]";
      if (!c || typeof c !== "object") { erros.push(p + ": Invalid value: must be an object"); return; }
      if (!c.name) erros.push(p + ".name: Required value");
      else if (!RFC1123_LABEL.test(c.name) || c.name.length > 63) erros.push(p + ".name: Invalid value: \"" + c.name + "\": " + ERRO_LABEL);
      if (!c.image) erros.push(p + ".image: Required value");
      else if (typeof c.image !== "string") erros.push(p + ".image: Invalid value: must be a string");
      if (c.ports) {
        if (!Array.isArray(c.ports)) erros.push(p + ".ports: Invalid value: must be a list");
        else c.ports.forEach(function (pt, j) {
          if (pt.containerPort == null) erros.push(p + ".ports[" + j + "].containerPort: Required value");
          else if (typeof pt.containerPort !== "number") erros.push(p + ".ports[" + j + "].containerPort: Invalid value: must be an integer");
          else if (pt.containerPort < 1 || pt.containerPort > 65535) erros.push(p + ".ports[" + j + "].containerPort: Invalid value: " + pt.containerPort + ": must be between 1 and 65535, inclusive");
          if (pt.name && !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(pt.name)) erros.push(p + ".ports[" + j + "].name: Invalid value: \"" + pt.name + "\": " + ERRO_LABEL);
          if (pt.protocol && ["TCP", "UDP", "SCTP"].indexOf(pt.protocol) < 0) erros.push(p + ".ports[" + j + "].protocol: Unsupported value: \"" + pt.protocol + "\": supported values: \"SCTP\", \"TCP\", \"UDP\"");
        });
      }
      if (c.resources) {
        ["requests", "limits"].forEach(function (tipo) {
          var r = c.resources[tipo];
          if (!r) return;
          Object.keys(r).forEach(function (chave) {
            if (typeof r[chave] !== "string" && typeof r[chave] !== "number") {
              erros.push(p + ".resources." + tipo + "." + chave + ": Invalid value: must be a string");
            }
          });
        });
      }
      if (c.env && !Array.isArray(c.env)) erros.push(p + ".env: Invalid value: must be a list");
      if (c.readinessProbe && c.readinessProbe.initialDelaySeconds != null && typeof c.readinessProbe.initialDelaySeconds !== "number") {
        erros.push(p + ".readinessProbe.initialDelaySeconds: Invalid value: must be an integer");
      }
    });
    (spec.initContainers || []).forEach(function (c, i) {
      var p = prefixo + ".initContainers[" + i + "]";
      if (!c.name) erros.push(p + ".name: Required value");
      if (!c.image) erros.push(p + ".image: Required value");
    });
  }

  function vSelectorTemplate(obj, erros) {
    /* a regra que mais pega iniciante: selector que não casa com os labels do template */
    var sel = obj.spec && obj.spec.selector;
    var tpl = obj.spec && obj.spec.template;
    if (!sel) { erros.push("spec.selector: Required value"); return; }
    if (!tpl) { erros.push("spec.template: Required value"); return; }
    if (sel.matchLabels && tpl.metadata && tpl.metadata.labels) {
      var faltando = Object.keys(sel.matchLabels).some(function (k) {
        return String(tpl.metadata.labels[k]) !== String(sel.matchLabels[k]);
      });
      if (faltando) {
        erros.push("spec.template.metadata.labels: Invalid value: " + JSON.stringify(tpl.metadata.labels) + ": `selector` does not match template `labels`");
      }
    }
  }

  function validar(obj) {
    var erros = [];
    var kind = obj.kind, api = obj.apiVersion;
    if (!api) erros.push("apiVersion: Required value");
    if (!kind) erros.push("kind: Required value");
    if (!kind) return erros;
    var rec = RECURSOS.filter(function (r) { return r.kind === kind; })[0];
    if (!rec) { erros.push("kind: Invalid value: \"" + kind + "\": no kind is registered for this resource"); return erros; }
    if (api && api !== rec.api) {
      erros.push("apiVersion: Invalid value: \"" + api + "\": no matches for kind \"" + kind + "\" in version \"" + api + "\" (o certo é " + rec.api + ")");
    }
    if (!obj.metadata) { erros.push("metadata: Required value"); return erros; }
    vNome(obj, erros);
    vLabels(obj, "metadata", erros);

    if (kind === "Pod") {
      vContainers(obj.spec, "spec", erros);
      if (obj.spec && obj.spec.restartPolicy && ["Always", "OnFailure", "Never"].indexOf(obj.spec.restartPolicy) < 0) {
        erros.push("spec.restartPolicy: Unsupported value: \"" + obj.spec.restartPolicy + "\": supported values: \"Always\", \"Never\", \"OnFailure\"");
      }
    }
    if (kind === "Deployment" || kind === "ReplicaSet" || kind === "StatefulSet" || kind === "DaemonSet") {
      if (obj.spec && obj.spec.replicas != null) {
        if (typeof obj.spec.replicas !== "number") erros.push("spec.replicas: Invalid value: " + JSON.stringify(obj.spec.replicas) + ": must be an integer");
        else if (obj.spec.replicas < 0) erros.push("spec.replicas: Invalid value: " + obj.spec.replicas + ": must be greater than or equal to 0");
      }
      vSelectorTemplate(obj, erros);
      if (obj.spec && obj.spec.template) {
        vContainers(obj.spec.template.spec, "spec.template.spec", erros);
        vLabels(obj.spec.template, "spec.template.metadata", erros);
        if (!obj.spec.template.metadata || !obj.spec.template.metadata.labels) {
          erros.push("spec.template.metadata.labels: Invalid value: null: `selector` does not match template `labels`");
        }
      }
      if (kind === "DaemonSet" && obj.spec && obj.spec.replicas != null) {
        erros.push("spec.replicas: Forbidden: may not be specified for DaemonSet");
      }
      if (kind === "Deployment" && obj.spec && obj.spec.strategy) {
        var st = obj.spec.strategy;
        if (st.type && ["RollingUpdate", "Recreate"].indexOf(st.type) < 0) {
          erros.push("spec.strategy.type: Unsupported value: \"" + st.type + "\": supported values: \"Recreate\", \"RollingUpdate\"");
        }
      }
      if (kind === "StatefulSet") {
        if (!obj.spec.serviceName) erros.push("spec.serviceName: Required value");
        if (obj.spec.template && obj.spec.template.spec) vContainers(obj.spec.template.spec, "spec.template.spec", erros);
      }
    }
    if (kind === "Job" || kind === "CronJob") {
      var tplJob = kind === "Job" ? obj.spec : obj.spec && obj.spec.jobTemplate && obj.spec.jobTemplate.spec;
      if (kind === "Job" && !obj.spec) erros.push("spec: Required value");
      if (kind === "CronJob") {
        if (!obj.spec || !obj.spec.schedule) erros.push("spec.schedule: Required value");
        else if (typeof obj.spec.schedule !== "string" || !/^(\S+\s+){4}\S+$/.test(obj.spec.schedule.trim())) {
          erros.push("spec.schedule: Invalid value: \"" + obj.spec.schedule + "\": expected exactly 5 fields, found " + String(obj.spec.schedule).trim().split(/\s+/).length + ": [minuto hora dia-do-mês mês dia-da-semana]");
        }
      }
      if (tplJob) {
        if (tplJob.template && tplJob.template.spec) {
          vContainers(tplJob.template.spec, "spec.template.spec", erros);
          var rp = tplJob.template.spec.restartPolicy;
          if (rp && rp !== "Never" && rp !== "OnFailure") {
            erros.push("spec.template.spec.restartPolicy: Unsupported value: \"" + rp + "\": supported values: \"OnFailure\", \"Never\"");
          }
          if (!rp) erros.push("spec.template.spec.restartPolicy: Required value: valid values: \"OnFailure\", \"Never\"");
        } else {
          erros.push("spec.template: Required value");
        }
      }
    }
    if (kind === "Service") {
      var sp = obj.spec || {};
      if (sp.type && ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"].indexOf(sp.type) < 0) {
        erros.push("spec.type: Unsupported value: \"" + sp.type + "\": supported values: \"ClusterIP\", \"ExternalName\", \"LoadBalancer\", \"NodePort\"");
      }
      if (!sp.ports || !sp.ports.length) erros.push("spec.ports: Required value");
      else sp.ports.forEach(function (p, i) {
        if (p.port == null) erros.push("spec.ports[" + i + "].port: Required value");
        if (p.port != null && (typeof p.port !== "number" || p.port < 1 || p.port > 65535)) erros.push("spec.ports[" + i + "].port: Invalid value: must be between 1 and 65535, inclusive");
        if (sp.type === "NodePort" && p.nodePort == null) {
          /* o nodePort é escolhido pelo controlador: não é erro */
        }
        if (p.nodePort != null && (p.nodePort < 30000 || p.nodePort > 32767)) erros.push("spec.ports[" + i + "].nodePort: Invalid value: " + p.nodePort + ": provided port is not in the valid range. The range of valid ports is 30000-32767");
        if (sp.ports.length > 1 && !p.name) erros.push("spec.ports[" + i + "].name: Required value: must be specified when there are multiple ports");
      });
      if (sp.type === "ExternalName" && !sp.externalName) erros.push("spec.externalName: Required value");
      if (sp.type !== "ExternalName" && !sp.selector && !sp.clusterIP) {
        erros.push("spec.clusterIP: Invalid value: \"\": must be empty or a valid IP address");
      }
    }
    if (kind === "Ingress") {
      if (!obj.spec) erros.push("spec: Required value");
      else if (!obj.spec.rules && !obj.spec.defaultBackend && !obj.spec.backend) erros.push("spec: Invalid value: either `defaultBackend` or `rules` must be specified");
      (obj.spec && obj.spec.rules || []).forEach(function (r, i) {
        (r.http && r.http.paths || []).forEach(function (p, j) {
          if (!p.pathType) erros.push("spec.rules[" + i + "].http.paths[" + j + "].pathType: Required value");
          else if (["Exact", "Prefix", "ImplementationSpecific"].indexOf(p.pathType) < 0) {
            erros.push("spec.rules[" + i + "].http.paths[" + j + "].pathType: Unsupported value: \"" + p.pathType + "\": supported values: \"Exact\", \"ImplementationSpecific\", \"Prefix\"");
          }
          if (!p.backend || !p.backend.service) erros.push("spec.rules[" + i + "].http.paths[" + j + "].backend.service: Required value");
        });
      });
    }
    if (kind === "ConfigMap" || kind === "Secret") {
      if (kind === "Secret" && obj.type && typeof obj.type !== "string") erros.push("type: Invalid value: must be a string");
    }
    if (kind === "HorizontalPodAutoscaler") {
      var hs = obj.spec || {};
      if (!hs.scaleTargetRef || !hs.scaleTargetRef.kind || !hs.scaleTargetRef.name) erros.push("spec.scaleTargetRef: Required value");
      if (hs.maxReplicas == null) erros.push("spec.maxReplicas: Required value");
      else if (typeof hs.maxReplicas !== "number" || hs.maxReplicas < 1) erros.push("spec.maxReplicas: Invalid value: " + hs.maxReplicas + ": must be greater than 0");
      if (hs.minReplicas != null && hs.maxReplicas != null && hs.minReplicas > hs.maxReplicas) {
        erros.push("spec.minReplicas: Invalid value: " + hs.minReplicas + ": must be less than or equal to maxReplicas");
      }
    }
    if (kind === "NetworkPolicy") {
      if (!obj.spec || (!obj.spec.podSelector && !obj.spec.podSelector === false)) erros.push("spec.podSelector: Required value");
      if (obj.spec && obj.spec.policyTypes) {
        obj.spec.policyTypes.forEach(function (t) {
          if (["Ingress", "Egress"].indexOf(t) < 0) erros.push("spec.policyTypes: Unsupported value: \"" + t + "\": supported values: \"Egress\", \"Ingress\"");
        });
      }
    }
    if (kind === "Namespace" && obj.metadata && obj.metadata.name && !RFC1123_LABEL.test(obj.metadata.name)) {
      erros.push("metadata.name: Invalid value: \"" + obj.metadata.name + "\": " + ERRO_LABEL);
    }
    return erros;
  }

  /* valor de recurso ("100m", "0.5", "1Gi") → número para o agendador */
  function cpuMil(v) {
    if (v == null) return 0;
    var s = String(v).trim();
    if (s.slice(-1) === "m") return parseFloat(s) || 0;
    return (parseFloat(s) || 0) * 1000;
  }
  function memoriaMi(v) {
    if (v == null) return 0;
    var s = String(v).trim(), m = /^([\d.]+)([KMGTP]i?)?$/.exec(s);
    if (!m) return 0;
    var n = parseFloat(m[1]) || 0, u = m[2] || "";
    var mult = { "": 1 / (1024 * 1024), K: 1 / 1024, Ki: 1 / 1024, M: 1, Mi: 1, G: 1024, Gi: 1024, T: 1024 * 1024, Ti: 1024 * 1024, P: 1024 * 1024 * 1024 };
    return n * (mult[u] != null ? mult[u] : 1);
  }

  /* ------------------------------------------------------------------ defaults */
  function comDefaults(obj) {
    var o = copia(obj);
    o.metadata = o.metadata || {};
    o.metadata.namespace = o.metadata.namespace || (recursoPorNome(o.kind).ns ? "default" : undefined);
    if (!o.metadata.labels) delete o.metadata.labels;
    o.spec = o.spec || {};

    function defaultsPod(spec) {
      spec.restartPolicy = spec.restartPolicy || "Always";
      spec.terminationGracePeriodSeconds = spec.terminationGracePeriodSeconds == null ? 30 : spec.terminationGracePeriodSeconds;
      spec.dnsPolicy = spec.dnsPolicy || "ClusterFirst";
      spec.schedulerName = spec.schedulerName || "default-scheduler";
      spec.securityContext = spec.securityContext || {};
      (spec.containers || []).forEach(function (c) {
        c.imagePullPolicy = c.imagePullPolicy || (/:(latest|[\d.]+)$/.test(c.image || "") && /:latest$/.test(c.image || "") ? "Always" : "IfNotPresent");
        (c.ports || []).forEach(function (p) { p.protocol = p.protocol || "TCP"; });
        c.resources = c.resources || {};
        c.resources.requests = c.resources.requests || {};
        c.resources.limits = c.resources.limits || {};
        c.terminationMessagePath = c.terminationMessagePath || "/dev/termination-log";
        c.terminationMessagePolicy = c.terminationMessagePolicy || "File";
      });
      return spec;
    }

    if (o.kind === "Pod") { o.spec = defaultsPod(o.spec); o.spec.enableServiceLinks = o.spec.enableServiceLinks !== false; o.spec.preemptionPolicy = o.spec.preemptionPolicy || "PreemptLowerPriority"; o.spec.priority = o.spec.priority == null ? 0 : o.spec.priority; }
    if (o.kind === "Deployment") {
      o.spec.replicas = o.spec.replicas == null ? 1 : o.spec.replicas;
      o.spec.revisionHistoryLimit = o.spec.revisionHistoryLimit == null ? 10 : o.spec.revisionHistoryLimit;
      o.spec.progressDeadlineSeconds = o.spec.progressDeadlineSeconds == null ? 600 : o.spec.progressDeadlineSeconds;
      o.spec.strategy = o.spec.strategy || {};
      o.spec.strategy.type = o.spec.strategy.type || "RollingUpdate";
      if (o.spec.strategy.type === "RollingUpdate") {
        o.spec.strategy.rollingUpdate = o.spec.strategy.rollingUpdate || {};
        if (o.spec.strategy.rollingUpdate.maxSurge == null) o.spec.strategy.rollingUpdate.maxSurge = "25%";
        if (o.spec.strategy.rollingUpdate.maxUnavailable == null) o.spec.strategy.rollingUpdate.maxUnavailable = "25%";
      }
      o.spec.template.metadata = o.spec.template.metadata || {};
      o.spec.template.metadata.labels = o.spec.template.metadata.labels || copia(o.spec.selector.matchLabels || {});
      o.spec.template.spec = defaultsPod(o.spec.template.spec || {});
    }
    if (o.kind === "StatefulSet") {
      o.spec.replicas = o.spec.replicas == null ? 1 : o.spec.replicas;
      o.spec.podManagementPolicy = o.spec.podManagementPolicy || "OrderedReady";
      o.spec.updateStrategy = o.spec.updateStrategy || { type: "RollingUpdate" };
      o.spec.revisionHistoryLimit = o.spec.revisionHistoryLimit == null ? 10 : o.spec.revisionHistoryLimit;
      o.spec.template.spec = defaultsPod(o.spec.template.spec || {});
    }
    if (o.kind === "DaemonSet") {
      o.spec.updateStrategy = o.spec.updateStrategy || { type: "RollingUpdate", rollingUpdate: { maxUnavailable: 1, maxSurge: 0 } };
      o.spec.revisionHistoryLimit = o.spec.revisionHistoryLimit == null ? 10 : o.spec.revisionHistoryLimit;
      o.spec.template.spec = defaultsPod(o.spec.template.spec || {});
    }
    if (o.kind === "Job") {
      o.spec.completions = o.spec.completions == null ? 1 : o.spec.completions;
      o.spec.parallelism = o.spec.parallelism == null ? 1 : o.spec.parallelism;
      o.spec.backoffLimit = o.spec.backoffLimit == null ? 6 : o.spec.backoffLimit;
      if (o.spec.template) { o.spec.template.metadata = o.spec.template.metadata || {}; o.spec.template.spec = defaultsPod(o.spec.template.spec || {}); }
    }
    if (o.kind === "CronJob") {
      o.spec.concurrencyPolicy = o.spec.concurrencyPolicy || "Allow";
      o.spec.suspend = o.spec.suspend === true;
      o.spec.successfulJobsHistoryLimit = o.spec.successfulJobsHistoryLimit == null ? 3 : o.spec.successfulJobsHistoryLimit;
      o.spec.failedJobsHistoryLimit = o.spec.failedJobsHistoryLimit == null ? 1 : o.spec.failedJobsHistoryLimit;
      if (o.spec.jobTemplate && o.spec.jobTemplate.spec) {
        o.spec.jobTemplate.spec.backoffLimit = o.spec.jobTemplate.spec.backoffLimit == null ? 6 : o.spec.jobTemplate.spec.backoffLimit;
        if (o.spec.jobTemplate.spec.template) o.spec.jobTemplate.spec.template.spec = defaultsPod(o.spec.jobTemplate.spec.template.spec || {});
      }
    }
    if (o.kind === "Service") {
      o.spec.type = o.spec.type || "ClusterIP";
      o.spec.sessionAffinity = o.spec.sessionAffinity || "None";
      if (o.spec.type !== "ExternalName") {
        o.spec.clusterIP = o.spec.clusterIP == null || o.spec.clusterIP === "" ? ipDoServico(o.metadata.namespace + "/" + o.metadata.name) : o.spec.clusterIP;
        o.spec.clusterIPs = o.spec.clusterIPs || [o.spec.clusterIP];
        o.spec.ipFamilies = o.spec.ipFamilies || ["IPv4"];
        o.spec.ipFamilyPolicy = o.spec.ipFamilyPolicy || "SingleStack";
      }
      (o.spec.ports || []).forEach(function (p, i) {
        p.protocol = p.protocol || "TCP";
        p.targetPort = p.targetPort == null ? p.port : p.targetPort;
        if (o.spec.type === "NodePort" && p.nodePort == null) p.nodePort = 30000 + (parseInt(hash36(o.metadata.name + i, 3), 36) % 2768);
      });
      if (o.spec.type === "NodePort" || o.spec.type === "LoadBalancer") o.spec.externalTrafficPolicy = o.spec.externalTrafficPolicy || "Cluster";
    }
    if (o.kind === "Namespace") {
      o.spec = o.spec || {};
      o.spec.finalizers = o.spec.finalizers || ["kubernetes"];
      o.status = { phase: "Active" };
    }
    if (o.kind === "PersistentVolumeClaim") {
      o.spec.accessModes = o.spec.accessModes || ["ReadWriteOnce"];
      o.spec.volumeMode = o.spec.volumeMode || "Filesystem";
    }
    if (o.kind === "PersistentVolume") {
      o.spec.accessModes = o.spec.accessModes || ["ReadWriteOnce"];
      o.spec.persistentVolumeReclaimPolicy = o.spec.persistentVolumeReclaimPolicy || "Retain";
      o.spec.volumeMode = o.spec.volumeMode || "Filesystem";
    }
    if (o.kind === "StorageClass") {
      o.reclaimPolicy = o.reclaimPolicy || "Delete";
      o.volumeBindingMode = o.volumeBindingMode || "Immediate";
    }
    if (o.kind === "HorizontalPodAutoscaler") {
      o.spec.minReplicas = o.spec.minReplicas == null ? 1 : o.spec.minReplicas;
      (o.spec.metrics || []).forEach(function (m) {
        if (m.resource && m.resource.target && m.resource.target.averageUtilization == null && m.resource.target.averageValue == null) {
          m.resource.target.averageUtilization = 0;
        }
      });
    }
    if (o.kind === "Secret") {
      o.type = o.type || "Opaque";
    }
    if (o.kind === "ServiceAccount") {
      o.secrets = o.secrets || [];
    }
    return o;
  }

  /* o cluster-IP é determinístico para o painel: 10.96.x.y */
  function ipDoServico(chave) {
    var h = 0;
    for (var i = 0; i < chave.length; i++) h = (Math.imul(h, 31) + chave.charCodeAt(i)) >>> 0;
    return "10.96." + (h % 250) + "." + ((h >>> 8) % 250 + 1);
  }
  function ipDoPod(chave) {
    var h = 0;
    for (var i = 0; i < chave.length; i++) h = (Math.imul(h, 33) + chave.charCodeAt(i)) >>> 0;
    return "10.244." + (h % 250) + "." + ((h >>> 8) % 250 + 2);
  }

  window.K8s = {
    VERSAO: VERSAO, esc: esc, norm: norm, copia: copia, hash36: hash36, idade: idade, idadeDo: idadeDo,
    yamlCarregar: yamlCarregar, RECURSOS: RECURSOS, recursoPorNome: recursoPorNome,
    validar: validar, comDefaults: comDefaults, cpuMil: cpuMil, memoriaMi: memoriaMi,
    ipDoServico: ipDoServico, ipDoPod: ipDoPod, ERRO_RFC1123: ERRO_RFC1123, ERRO_LABEL: ERRO_LABEL
  };
})();

/* =====================================================================
   Cluster: objetos, agendador e controladores
   ===================================================================== */
(function () {
  "use strict";
  var K = window.K8s;
  var esc = K.esc, copia = K.copia, norm = K.norm;

  var GRUPO = {
    Deployment: "apps", ReplicaSet: "apps", StatefulSet: "apps", DaemonSet: "apps",
    Job: "batch", CronJob: "batch",
    Ingress: "networking.k8s.io", NetworkPolicy: "networking.k8s.io",
    HorizontalPodAutoscaler: "autoscaling",
    Role: "rbac.authorization.k8s.io", RoleBinding: "rbac.authorization.k8s.io",
    ClusterRole: "rbac.authorization.k8s.io", ClusterRoleBinding: "rbac.authorization.k8s.io",
    StorageClass: "storage.k8s.io",
    EndpointSlice: "discovery.k8s.io"
  };

  /* "deployment.apps" / "pod" — como o kubectl escreve depois do apply */
  function nomeKubectl(kind) {
    var r = K.recursoPorNome(kind);
    var base = r.singular;
    return GRUPO[kind] ? base + "." + GRUPO[kind] : base;
  }

  function novoCluster(opcoes) {
    var o = opcoes || {};
    var c = {
      versao: K.VERSAO,
      nos: o.nos || [
        { nome: "guia-control-plane", papel: "control-plane", cpu: 2000, memoria: 4096, labels: { "kubernetes.io/hostname": "guia-control-plane" }, taints: [] },
        { nome: "guia-worker", papel: "worker", cpu: 2000, memoria: 4096, labels: { "kubernetes.io/hostname": "guia-worker" }, taints: [] },
        { nome: "guia-worker2", papel: "worker", cpu: 2000, memoria: 4096, labels: { "kubernetes.io/hostname": "guia-worker2" }, taints: [] }
      ],
      objs: [],
      eventos: [],
      metricas: o.metricas || {},
      contador: 0
    };
    ["default", "kube-system"].forEach(function (n) {
      c.objs.push({ kind: "Namespace", apiVersion: "v1", metadata: { name: n, labels: { "kubernetes.io/metadata.name": n } }, spec: { finalizers: ["kubernetes"] }, status: { phase: "Active" } });
    });
    return c;
  }

  function achar(c, kind, ns, nome) {
    return c.objs.filter(function (x) {
      return x.kind === kind && x.metadata.name === nome && (!K.recursoPorNome(kind).ns || x.metadata.namespace === (ns || "default"));
    })[0] || null;
  }
  function listar(c, kind, ns) {
    return c.objs.filter(function (x) {
      return x.kind === kind && (!K.recursoPorNome(kind).ns || !ns || x.metadata.namespace === ns);
    }).sort(function (a, b) { return (a.metadata.namespace || "") + a.metadata.name < (b.metadata.namespace || "") + b.metadata.name ? -1 : 1; });
  }
  function remover(c, obj) {
    var i = c.objs.indexOf(obj);
    if (i >= 0) c.objs.splice(i, 1);
  }
  function evento(c, obj, tipo, motivo, msg) {
    c.eventos.push({
      tipo: tipo, motivo: motivo, objeto: obj.kind + "/" + obj.metadata.name,
      ns: obj.metadata.namespace || "", msg: msg, quando: (20 + (c.eventos.length * 3)) + "s"
    });
  }

  /* "app=cardapio,tier=web" → objeto de labels */
  function seletorDeTexto(txt) {
    var out = {};
    String(txt || "").split(",").forEach(function (p) {
      var i = p.indexOf("=");
      if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    return out;
  }
  function casaSeletor(labels, sel) {
    if (!sel) return false;
    labels = labels || {};
    var ok = Object.keys(sel || {}).every(function (k) { return String(labels[k]) === String(sel[k]); });
    if (!ok || !sel.matchExpressions) return ok;
    return sel.matchExpressions.every(function (e) {
      var v = labels[e.key];
      if (e.operator === "In") return e.values.indexOf(v) >= 0;
      if (e.operator === "NotIn") return e.values.indexOf(v) < 0;
      if (e.operator === "Exists") return v != null;
      if (e.operator === "DoesNotExist") return v == null;
      return false;
    });
  }

  /* ------------------------------------------------------------- agendador */
  function pedidosDoPod(pod) {
    var c = pod.spec.containers || [], cpu = 0, mem = 0;
    c.forEach(function (x) {
      cpu += K.cpuMil(x.resources && x.resources.requests && x.resources.requests.cpu);
      mem += K.memoriaMi(x.resources && x.resources.requests && x.resources.requests.memory);
    });
    return { cpu: cpu, memoria: mem };
  }
  function usadoNoNo(c, no) {
    var cpu = 0, mem = 0;
    c.objs.forEach(function (p) {
      if (p.kind !== "Pod" || !p.status || p.status.no !== no.nome) return;
      var q = pedidosDoPod(p);
      cpu += q.cpu; mem += q.memoria;
    });
    return { cpu: cpu, memoria: mem };
  }
  function tolera(taint, pod) {
    var tols = (pod.spec.tolerations || []);
    if (!taint) return true;
    return tols.some(function (t) {
      if (t.effect && t.effect !== taint.effect) return false;
      if (t.key && t.key !== taint.key) return false;
      return t.operator === "Exists" || !t.value || t.value === taint.value;
    });
  }
  function agendar(c, pod) {
    if (pod.status && pod.status.no) return pod.status.no;
    var q = pedidosDoPod(pod);
    var candidatos = [], motivos = [];
    c.nos.forEach(function (no) {
      var bloqueios = [];
      (no.taints || []).forEach(function (t) {
        if (t.effect === "NoSchedule" && !tolera(t, pod)) bloqueios.push("node(s) had untolerated taint {" + t.key + ": " + (t.value || "") + "}");
      });
      var sel = pod.spec.nodeSelector || {};
      Object.keys(sel).forEach(function (k) { if (no.labels[k] !== sel[k]) bloqueios.push("node(s) didn't match Pod's node affinity/selector"); });
      if (pod.spec.nodeName && pod.spec.nodeName !== no.nome) bloqueios.push("node(s) didn't match Pod's node name");
      var u = usadoNoNo(c, no);
      if (u.cpu + q.cpu > no.cpu) bloqueios.push("Insufficient cpu");
      if (u.memoria + q.memoria > no.memoria) bloqueios.push("Insufficient memory");
      if (bloqueios.length) { motivos.push(bloqueios[0]); return; }
      candidatos.push(no);
    });
    if (!candidatos.length) {
      var contagem = {};
      motivos.forEach(function (m) { contagem[m] = (contagem[m] || 0) + 1; });
      var detalhe = Object.keys(contagem).map(function (m) { return contagem[m] + " " + m; }).join(", ");
      var msg = "0/" + c.nos.length + " nodes are available: " + (detalhe || "no nodes available") + ". preemption: 0/" + c.nos.length + " nodes are available: " + c.nos.length + " Preemption is not helpful for scheduling.";
      return { erro: msg };
    }
    candidatos.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
    return { no: candidatos[0].nome };
  }

  /* ---------------------------------------------------------- pods e status */
  function criarPod(c, dono, ns, nome, tpl, extra) {
    var pod = {
      kind: "Pod", apiVersion: "v1",
      metadata: {
        name: nome, namespace: ns,
        labels: copia((tpl.metadata && tpl.metadata.labels) || {}),
        ownerReferences: dono ? [{ kind: dono.kind, name: dono.metadata.name, controller: true }] : undefined
      },
      spec: copia(tpl.spec || {}),
      status: { phase: "Pending", ready: false, reinicios: 0, conditions: [] }
    };
    if (extra && extra.labels) {
      Object.keys(extra.labels).forEach(function (k) { pod.metadata.labels[k] = extra.labels[k]; });
    }
    if (extra && extra.volumes) pod.spec.volumes = (pod.spec.volumes || []).concat(extra.volumes);
    c.objs.push(pod);

    var cobertura = pod.spec.nodeName && c.nos.filter(function (n) { return n.nome === pod.spec.nodeName; })[0];
    var r = agendar(c, cobertura ? pod : pod);
    if (r.erro) {
      pod.status.phase = "Pending";
      pod.status.motivo = "FailedScheduling";
      pod.status.mensagem = r.erro;
      evento(c, pod, "Warning", "FailedScheduling", r.erro);
      return pod;
    }
    pod.status.no = r.no;
    pod.status.phase = "Running";
    pod.status.ready = true;
    pod.status.ip = K.ipDoPod(ns + "/" + nome + "/" + c.objs.length);
    pod.status.iniciadoEm = 20 + (c.objs.length % 40);
    pod.status.conditions = [
      { tipo: "PodScheduled", status: "True" },
      { tipo: "Initialized", status: "True" },
      { tipo: "Ready", status: "True" },
      { tipo: "ContainersReady", status: "True" }
    ];
    return pod;
  }

  function podPronto(p) { return p.status && p.status.phase === "Running" && p.status.ready; }

  /* -------------------------------------------------- hash do template (rs) */
  function hashTemplate(tpl) {
    return K.hash36(JSON.stringify(tpl), 10);
  }
  function contasDesejadas(c, dep) {
    var rs = listar(c, "ReplicaSet", dep.metadata.namespace).filter(function (r) {
      return r.metadata.ownerReferences && r.metadata.ownerReferences[0] && r.metadata.ownerReferences[0].name === dep.metadata.name && r.metadata.ownerReferences[0].kind === "Deployment";
    });
    var atual = rs[rs.length - 1];
    if (!atual) {
      var novo = {
        kind: "ReplicaSet", apiVersion: "apps/v1",
        metadata: {
          name: dep.metadata.name + "-" + hashTemplate(dep.spec.template),
          namespace: dep.metadata.namespace,
          labels: copia(dep.spec.template.metadata.labels || {}),
          ownerReferences: [{ kind: "Deployment", name: dep.metadata.name, controller: true }]
        },
        spec: { replicas: dep.spec.replicas, selector: copia(dep.spec.selector), template: copia(dep.spec.template) },
        status: { replicas: 0, ready: 0 }
      };
      c.objs.push(novo);
      atual = novo;
      evento(c, dep, "Normal", "ScalingReplicaSet", "Scaled up replica set " + novo.metadata.name + " to " + dep.spec.replicas);
    }
    /* escala os ReplicaSets antigos para 0 (rollout concluído) */
    rs.forEach(function (r) { if (r !== atual) r.spec.replicas = 0; });
    atual.spec.replicas = dep.spec.replicas;
    return { rs: atual, antigos: rs.filter(function (r) { return r !== atual; }) };
  }

  function reconciliarRS(c, rs) {
    var ns = rs.metadata.namespace;
    var meus = listar(c, "Pod", ns).filter(function (p) {
      return p.metadata.ownerReferences && p.metadata.ownerReferences[0].name === rs.metadata.name;
    });
    while (meus.length > rs.spec.replicas) { remover(c, meus.pop()); }
    for (var i = meus.length; i < rs.spec.replicas; i++) {
      var nome = rs.metadata.name + "-" + K.hash36(rs.metadata.name + "/" + i, 5);
      meus.push(criarPod(c, rs, ns, nome, rs.spec.template));
    }
    rs.status.replicas = meus.length;
    rs.status.ready = meus.filter(podPronto).length;
    return meus;
  }

  /* ------------------------------------------------------------- reconciliação */
  function reconciliar(c) {
    /* Pods soltos (sem dono) também passam pelo agendador */
    listar(c, "Pod").forEach(function (p) {
      if (p.status && (p.status.no || p.status.motivo)) return;
      if (p.metadata.ownerReferences && p.metadata.ownerReferences.length) return;
      p.status = p.status || { phase: "Pending", ready: false, reinicios: 0, conditions: [] };
      var r = agendar(c, p);
      if (r.erro) {
        p.status.phase = "Pending";
        p.status.motivo = "FailedScheduling";
        p.status.mensagem = r.erro;
        evento(c, p, "Warning", "FailedScheduling", r.erro);
      } else {
        p.status.no = r.no;
        p.status.phase = "Running";
        p.status.ready = true;
        p.status.ip = K.ipDoPod(p.metadata.namespace + "/" + p.metadata.name + "/" + c.objs.length);
        p.status.iniciadoEm = 20 + (c.objs.length % 40);
        p.status.conditions = [
          { tipo: "PodScheduled", status: "True" },
          { tipo: "Initialized", status: "True" },
          { tipo: "Ready", status: "True" },
          { tipo: "ContainersReady", status: "True" }
        ];
      }
    });

    /* Deployments */
    listar(c, "Deployment").forEach(function (dep) {
      var ns = dep.metadata.namespace;
      var info = contasDesejadas(c, dep);
      var podsNovos = reconciliarRS(c, info.rs);
      /* pods dos RS antigos: somem quando a escala vai a 0 */
      info.antigos.forEach(function (r) {
        listar(c, "Pod", ns).filter(function (p) {
          return p.metadata.ownerReferences && p.metadata.ownerReferences[0].name === r.metadata.name;
        }).forEach(function (p) { remover(c, p); });
        r.status.replicas = 0; r.status.ready = 0;
      });
      var prontos = podsNovos.filter(podPronto).length;
      dep.status = dep.status || {};
      dep.status.replicas = podsNovos.length;
      dep.status.readyReplicas = prontos;
      dep.status.availableReplicas = prontos;
      dep.status.updatedReplicas = podsNovos.length;
      dep.status.unavailableReplicas = Math.max(0, dep.spec.replicas - prontos);
      dep.status.conditions = [{
        type: prontos >= dep.spec.replicas ? "Available" : "Progressing",
        status: "True",
        reason: prontos >= dep.spec.replicas ? "MinimumReplicasAvailable" : "ReplicaSetUpdated"
      }];
    });

    /* StatefulSets: pods <nome>-0..n-1, cada um com o seu PVC */
    listar(c, "StatefulSet").forEach(function (sts) {
      var ns = sts.metadata.namespace;
      var existentes = listar(c, "Pod", ns).filter(function (p) {
        return p.metadata.ownerReferences && p.metadata.ownerReferences[0].name === sts.metadata.name;
      });
      while (existentes.length > sts.spec.replicas) remover(c, existentes.pop());
      for (var i = existentes.length; i < sts.spec.replicas; i++) {
        var nome = sts.metadata.name + "-" + i;
        var extra = { labels: { "statefulset.kubernetes.io/pod-name": nome }, volumes: [] };
        (sts.spec.volumeClaimTemplates || []).forEach(function (vct) {
          var pvcNome = vct.metadata.name + "-" + nome;
          if (!achar(c, "PersistentVolumeClaim", ns, pvcNome)) {
            var pvc = K.comDefaults({ apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: pvcNome, namespace: ns, labels: copia(vct.metadata.labels || {}) }, spec: copia(vct.spec || {}) });
            pvc.status = { phase: "Bound", capacity: { storage: (vct.spec.resources && vct.spec.resources.requests && vct.spec.resources.requests.storage) || "1Gi" } };
            c.objs.push(pvc);
          }
          extra.volumes.push({ name: vct.metadata.name, persistentVolumeClaim: { claimName: pvcNome } });
        });
        existentes.push(criarPod(c, sts, ns, nome, sts.spec.template, extra));
      }
      sts.status = { replicas: existentes.length, readyReplicas: existentes.filter(podPronto).length, currentReplicas: existentes.length, updatedReplicas: existentes.length };
    });

    /* DaemonSets: um pod por nó que casa */
    listar(c, "DaemonSet").forEach(function (ds) {
      var ns = ds.metadata.namespace;
      var alvo = c.nos.filter(function (no) {
        if (ds.spec.template.spec && ds.spec.template.spec.nodeSelector) {
          var sel = ds.spec.template.spec.nodeSelector;
          return Object.keys(sel).every(function (k) { return no.labels[k] === sel[k]; });
        }
        return no.papel !== "control-plane" || (ds.spec.template.spec.tolerations || []).length > 0;
      });
      var existentes = listar(c, "Pod", ns).filter(function (p) {
        return p.metadata.ownerReferences && p.metadata.ownerReferences[0].name === ds.metadata.name;
      });
      while (existentes.length > alvo.length) remover(c, existentes.pop());
      alvo.forEach(function (no, i) {
        if (i < existentes.length) return;
        var nome = ds.metadata.name + "-" + K.hash36(ds.metadata.name + "/" + no.nome, 5);
        var tpl = copia(ds.spec.template);
        tpl.spec.nodeName = no.nome;
        existentes.push(criarPod(c, ds, ns, nome, tpl));
      });
      ds.status = { desiredNumberScheduled: alvo.length, currentNumberScheduled: existentes.length, numberReady: existentes.filter(podPronto).length, numberAvailable: existentes.filter(podPronto).length };
    });

    /* Jobs: os pods rodam e completam */
    listar(c, "Job").forEach(function (job) {
      var ns = job.metadata.namespace;
      var meus = listar(c, "Pod", ns).filter(function (p) {
        return p.metadata.ownerReferences && p.metadata.ownerReferences[0].name === job.metadata.name;
      });
      var alvo = job.spec.completions || 1;
      while (meus.length > alvo) remover(c, meus.pop());
      for (var i = meus.length; i < alvo; i++) {
        var nome = job.metadata.name + "-" + K.hash36(job.metadata.name + "/" + i, 5);
        var p = criarPod(c, job, ns, nome, job.spec.template);
        if (p.status.phase === "Running") { p.status.phase = "Succeeded"; p.status.ready = false; }
        meus.push(p);
      }
      var ok = meus.filter(function (p) { return p.status.phase === "Succeeded"; }).length;
      job.status = { succeeded: ok, active: meus.length - ok, conditions: ok >= alvo ? [{ type: "Complete", status: "True" }] : [] };
    });

    /* Serviços → Endpoints (só pod pronto) */
    listar(c, "Service").forEach(function (svc) {
      var ep = achar(c, "Endpoints", svc.metadata.namespace, svc.metadata.name);
      if (!ep) {
        ep = { kind: "Endpoints", apiVersion: "v1", metadata: { name: svc.metadata.name, namespace: svc.metadata.namespace, labels: { "endpoints.kubernetes.io/managed-by": "endpoint-controller" } }, subsets: [] };
        c.objs.push(ep);
      }
      var sel = svc.spec.selector;
      var pods = sel ? listar(c, "Pod", svc.metadata.namespace).filter(function (p) { return casaSeletor(p.metadata.labels, sel); }) : [];
      var prontos = pods.filter(podPronto);
      ep.subsets = prontos.length ? [{
        addresses: prontos.map(function (p) { return { ip: p.status.ip, nodeName: p.status.no, targetRef: { kind: "Pod", name: p.metadata.name, namespace: p.metadata.namespace } }; }),
        ports: (svc.spec.ports || []).map(function (p) { return { port: p.targetPort, protocol: p.protocol }; })
      }] : [];
      if (svc.spec.type === "LoadBalancer") {
        svc.status = { loadBalancer: { ingress: [{ ip: "192.0.2." + (10 + (parseInt(K.hash36(svc.metadata.name, 2), 36) % 200)) }] } };
      }
    });

    /* HPA: conta as réplicas desejadas a partir da métrica semeada */
    listar(c, "HorizontalPodAutoscaler").forEach(function (hpa) {
      var alvo = hpa.spec.scaleTargetRef || {};
      var dep = alvo.kind === "Deployment" ? achar(c, "Deployment", hpa.metadata.namespace, alvo.name) : null;
      var m = (hpa.spec.metrics && hpa.spec.metrics[0]) || {};
      var alvoUso = (m.resource && m.resource.target && m.resource.target.averageUtilization) || 80;
      var usoAtual = (window.K8sCenario && window.K8sCenario.metricaAtual) || alvoUso;
      var desejadas = dep ? Math.ceil((dep.spec.replicas || 1) * usoAtual / alvoUso) : 0;
      desejadas = Math.max(hpa.spec.minReplicas || 1, Math.min(hpa.spec.maxReplicas || 1, desejadas));
      if (dep) {
        dep.spec.replicas = desejadas;
        hpa.status = {
          currentReplicas: dep.status ? dep.status.replicas : 0,
          desiredReplicas: desejadas,
          currentMetrics: [{ type: "Resource", resource: { name: (m.resource && m.resource.name) || "cpu", current: { averageUtilization: usoAtual, averageValue: (usoAtual * 10) + "m" } } }],
          conditions: [{ type: "AbleToScale", status: "True", reason: "ReadyForNewScale" }]
        };
      }
    });
  }

  /* aplicar uma lista de documentos → linhas do kubectl apply */
  function aplicar(c, docs) {
    var linhas = [], erros = [], aplicados = [];
    docs.forEach(function (bruto) {
      var kind = bruto && bruto.kind;
      if (!kind) { erros.push("error: unable to decode \"" + "STDIN" + "\": Object 'Kind' is missing"); return; }
      var rec = K.recursoPorNome(kind);
      var nome = bruto.metadata && bruto.metadata.name || "";
      var ns = (bruto.metadata && bruto.metadata.namespace) || "default";
      if (rec && bruto.apiVersion && bruto.apiVersion !== rec.api) {
        erros.push('error: resource mapping not found for name: "' + nome + '" namespace: "' + ((bruto.metadata && bruto.metadata.namespace) || "") +
          '" from "STDIN": no matches for kind "' + kind + '" in version "' + bruto.apiVersion + '"\nensure CRDs are installed first');
        return;
      }
      var problemas = K.validar(bruto);
      if (problemas.length) {
        erros.push('The ' + kind + ' "' + nome + '" is invalid: ' + problemas.join("; "));
        return;
      }
      if (rec && rec.ns && !achar(c, "Namespace", null, ns)) {
        erros.push('Error from server (NotFound): error when creating "STDIN": namespaces "' + ns + '" not found');
        return;
      }
      var obj = K.comDefaults(bruto);
      var existente = achar(c, kind, obj.metadata.namespace, obj.metadata.name);
      if (existente) {
        obj.status = existente.status;
        var igual = JSON.stringify(obj.spec) === JSON.stringify(existente.spec);
        remover(c, existente);
        c.objs.push(obj);
        linhas.push(nomeKubectl(kind) + "/" + obj.metadata.name + (igual ? " unchanged" : " configured"));
        evento(c, obj, "Normal", "Applied", "applied by ana");
      } else {
        c.objs.push(obj);
        linhas.push(nomeKubectl(kind) + "/" + obj.metadata.name + " created");
        evento(c, obj, "Normal", "Created", "created by ana");
      }
      aplicados.push(obj);
    });
    reconciliar(c);
    return { linhas: linhas, erros: erros, aplicados: aplicados };
  }

  function removerObjeto(c, obj) { remover(c, obj); reconciliar(c); }

  window.K8sCluster = {
    novo: novoCluster, achar: achar, listar: listar, aplicar: aplicar, reconciliar: reconciliar,
    remover: removerObjeto, casarSeletor: casaSeletor, seletorDeTexto: seletorDeTexto,
    nomeKubectl: nomeKubectl, podPronto: podPronto, evento: evento, GRUPO: GRUPO,
    usadoNoNo: usadoNoNo, pedidosDoPod: pedidosDoPod
  };
})();

/* =====================================================================
   kubectl: os comandos e a saída (tabelas, describe, yaml)
   ===================================================================== */
(function () {
  "use strict";
  var K = window.K8s, C = window.K8sCluster;
  var esc = K.esc, copia = K.copia, norm = K.norm;

  /* tabwriter do kubectl: cada coluna tem no mínimo 3 espaços de folga */
  function tabela(linhas) {
    if (!linhas.length) return "";
    var colunas = Math.max.apply(null, linhas.map(function (l) { return l.length; }));
    var larg = [];
    for (var i = 0; i < colunas; i++) {
      larg[i] = Math.max.apply(null, linhas.map(function (l) { return (l[i] || "").length; }));
    }
    return linhas.map(function (l) {
      var out = "";
      l.forEach(function (c, i) {
        if (i === l.length - 1) { out += c; return; }
        out += c + new Array(Math.max(3, larg[i] - c.length + 3) + 1).join(" ");
      });
      return out.replace(/\s+$/, "");
    }).join("\n");
  }

  function semUndef(o) {
    if (Array.isArray(o)) return o.map(semUndef);
    if (o && typeof o === "object") {
      var r = {};
      Object.keys(o).sort().forEach(function (k) {
        if (o[k] === undefined) return;
        if (k === "uid" || k === "resourceVersion" || k === "creationTimestamp") return;
        r[k] = semUndef(o[k]);
      });
      return r;
    }
    return o;
  }

  /* yaml de saída: chaves na ordem do objeto (o kubectl ordena alfabeticamente) */
  function paraYaml(obj) {
    return window.jsyaml.dump(semUndef(obj), { lineWidth: 200, noRefs: true, quotingType: '"', sortKeys: false });
  }

  /* ------------------------------------------------------------- seletores */
  function filtrar(c, rec, lista, opts) {
    var out = lista;
    if (opts.seletor) {
      var sel = C.seletorDeTexto(opts.seletor);
      out = out.filter(function (o) { return Object.keys(sel).every(function (k) { return String((o.metadata.labels || {})[k]) === sel[k]; }); });
    }
    return out;
  }

  function colunaIdade(obj) { return K.idadeDo((obj.metadata.namespace || "") + obj.metadata.name); }

  /* --------------------------------------------------------------- get pods */
  function getPods(c, lista, opts) {
    if (opts.o === "yaml") return paraYaml({ apiVersion: "v1", kind: "List", metadata: { resourceVersion: "" }, items: lista });
    if (opts.o === "json") return JSON.stringify({ apiVersion: "v1", kind: "List", items: lista }, null, 4);
    if (opts.o === "name") return lista.map(function (p) { return "pod/" + p.metadata.name; }).join("\n");
    var cab = ["NAME", "READY", "STATUS", "RESTARTS", "AGE"];
    var wide = opts.o === "wide";
    if (wide) cab = cab.concat(["IP", "NODE", "NOMINATED NODE", "READINESS GATES"]);
    if (opts.mostrarLabels) cab = cab.concat(["LABELS"]);
    var linhas = [cab];
    lista.forEach(function (p) {
      var total = (p.spec.containers || []).length;
      var prontos = p.status && p.status.ready ? total : 0;
      var status = p.status ? p.status.phase : "Pending";
      var l = [p.metadata.name, prontos + "/" + total, status, String((p.status && p.status.reinicios) || 0), colunaIdade(p)];
      if (wide) l = l.concat([(p.status && p.status.ip) || "<none>", (p.status && p.status.no) || "<none>", "<none>", "<none>"]);
      if (opts.mostrarLabels) l = l.concat([Object.keys(p.metadata.labels || {}).sort().map(function (k) { return k + "=" + p.metadata.labels[k]; }).join(",")]);
      linhas.push(l);
    });
    if (lista.length === 1 && opts.comNome) {
      /* kubectl get pod nome imprime o nome na primeira coluna, igual à lista */
    }
    return tabela(linhas);
  }

  function getDeploy(c, lista, opts) {
    if (opts.o === "yaml") return paraYaml(lista.length === 1 ? lista[0] : { apiVersion: "v1", kind: "List", items: lista });
    if (opts.o === "name") return lista.map(function (d) { return "deployment.apps/" + d.metadata.name; }).join("\n");
    var linhas = [["NAME", "READY", "UP-TO-DATE", "AVAILABLE", "AGE"]];
    lista.forEach(function (d) {
      var s = d.status || {};
      linhas.push([d.metadata.name, (s.readyReplicas || 0) + "/" + d.spec.replicas, String(s.updatedReplicas || 0), String(s.availableReplicas || 0), colunaIdade(d)]);
    });
    return tabela(linhas);
  }

  function getRS(c, lista, opts) {
    if (opts.o === "yaml") return paraYaml(lista.length === 1 ? lista[0] : { apiVersion: "v1", kind: "List", items: lista });
    var linhas = [["NAME", "DESIRED", "CURRENT", "READY", "AGE"]];
    lista.forEach(function (r) {
      linhas.push([r.metadata.name, String(r.spec.replicas), String(r.status ? r.status.replicas : 0), String(r.status ? r.status.ready : 0), colunaIdade(r)]);
    });
    return tabela(linhas);
  }

  function getSvcs(c, lista, opts) {
    if (opts.o === "yaml") return paraYaml(lista.length === 1 ? lista[0] : { apiVersion: "v1", kind: "List", items: lista });
    var cab = ["NAME", "TYPE", "CLUSTER-IP", "EXTERNAL-IP", "PORT(S)", "AGE"];
    if (opts.o === "wide") cab.splice(5, 0, "SELECTOR");
    var linhas = [cab];
    lista.forEach(function (s) {
      var portas = (s.spec.ports || []).map(function (p) {
        return p.port + (p.nodePort ? ":" + p.nodePort : "") + "/" + p.protocol;
      }).join(",");
      var ext = s.spec.type === "LoadBalancer" ? ((s.status && s.status.loadBalancer && s.status.loadBalancer.ingress || [])[0] || {}).ip || "<pending>" : (s.spec.type === "ExternalName" ? s.spec.externalName : "<none>");
      var l = [s.metadata.name, s.spec.type, s.spec.clusterIP || "<none>", ext, portas, colunaIdade(s)];
      if (opts.o === "wide") l.splice(5, 0, Object.keys(s.spec.selector || {}).sort().map(function (k) { return k + "=" + s.spec.selector[k]; }).join(","));
      linhas.push(l);
    });
    return tabela(linhas);
  }

  function getEndpoints(c, lista, opts) {
    if (opts.o === "yaml") return paraYaml(lista.length === 1 ? lista[0] : { apiVersion: "v1", kind: "List", items: lista });
    var linhas = [["NAME", "ENDPOINTS", "AGE"]];
    lista.forEach(function (e) {
      var partes = (e.subsets || []).map(function (s) {
        return (s.addresses || []).map(function (a) { return a.ip + ":" + ((s.ports || [])[0] || {}).port; }).join(",");
      }).filter(Boolean);
      linhas.push([e.metadata.name, partes.length ? partes.join(",") : "<none>", colunaIdade(e)]);
    });
    return tabela(linhas);
  }

  function getNos(c, lista, opts) {
    var cab = ["NAME", "STATUS", "ROLES", "AGE", "VERSION"];
    if (opts.o === "wide") cab = ["NAME", "STATUS", "ROLES", "AGE", "VERSION", "INTERNAL-IP", "EXTERNAL-IP", "OS-IMAGE", "KERNEL-VERSION", "CONTAINER-RUNTIME"];
    var linhas = [cab];
    lista.forEach(function (n) {
      var base = [n.metadata.name, "Ready", n.papel === "control-plane" ? "control-plane" : "<none>", colunaIdade(n), K.VERSAO];
      linhas.push(opts.o === "wide" ? base.concat(["192.0.2." + (10 + n.metadata.name.length), "<none>", "Debian GNU/Linux 12 (bookworm)", "6.8.0-45-generic", "containerd://1.7.24"]) : base);
    });
    return tabela(linhas);
  }

  function getCmOuSecret(c, lista, opts, kind) {
    if (opts.o === "yaml") return paraYaml(lista.length === 1 ? lista[0] : { apiVersion: "v1", kind: "List", items: lista });
    var linhas = [["NAME", "DATA", "AGE"]];
    lista.forEach(function (o) {
      var n = Object.keys(o.data || {}).length + Object.keys(o.binaryData || {}).length;
      linhas.push([o.metadata.name, String(n), colunaIdade(o)]);
    });
    return tabela(linhas);
  }

  function getGenerico(c, rec, lista, opts, kind) {
    if (opts.o === "yaml") return paraYaml(lista.length === 1 ? lista[0] : { apiVersion: "v1", kind: "List", items: lista });
    if (opts.o === "name") return lista.map(function (o) { return C.nomeKubectl(kind) + "/" + o.metadata.name; }).join("\n");
    var cab = ["NAME", "AGE"];
    if (kind === "Ingress") cab = ["NAME", "CLASS", "HOSTS", "ADDRESS", "PORTS", "AGE"];
    if (kind === "HorizontalPodAutoscaler") cab = ["NAME", "REFERENCE", "TARGETS", "MINPODS", "MAXPODS", "REPLICAS", "AGE"];
    if (kind === "PersistentVolumeClaim") cab = ["NAME", "STATUS", "VOLUME", "CAPACITY", "ACCESS MODES", "STORAGECLASS", "AGE", "VOLUMEMODE"];
    var linhas = [cab];
    lista.forEach(function (o) {
      var l;
      if (kind === "Ingress") {
        var hosts = [];
        (o.spec.rules || []).forEach(function (r) { if (r.host) hosts.push(r.host); });
        l = [o.metadata.name, o.spec.ingressClassName || "<none>", hosts.join(",") || "*", "192.0.2.10", "80, 443", colunaIdade(o)];
      } else if (kind === "HorizontalPodAutoscaler") {
        var t = o.spec.scaleTargetRef || {};
        var m = (o.spec.metrics || [])[0] || {};
        var alvo = (m.resource && m.resource.target && m.resource.target.averageUtilization) || 0;
        var atual = (o.status && o.status.currentMetrics && o.status.currentMetrics[0] && o.status.currentMetrics[0].resource.current.averageUtilization) || 0;
        l = [o.metadata.name, t.kind + "/" + t.name, atual + "%/" + alvo + "%", String(o.spec.minReplicas || 1), String(o.spec.maxReplicas), String((o.status && o.status.currentReplicas) || 0), colunaIdade(o)];
      } else if (kind === "PersistentVolumeClaim") {
        l = [o.metadata.name, (o.status && o.status.phase) || "Pending", "pvc-" + K.hash36(o.metadata.name, 8), (o.status && o.status.capacity && o.status.capacity.storage) || "", "RWO", o.spec.storageClassName || "", colunaIdade(o), "Filesystem"];
      } else {
        l = [o.metadata.name, colunaIdade(o)];
      }
      linhas.push(l);
    });
    return tabela(linhas);
  }

  function getEventos(c, lista, opts) {
    var linhas = [["LAST SEEN", "TYPE", "REASON", "OBJECT", "MESSAGE"]];
    (c.eventos.length ? c.eventos : []).slice(-12).forEach(function (e) {
      linhas.push([e.quando, e.tipo, e.motivo, e.objeto, e.msg]);
    });
    return linhas.length > 1 ? tabela(linhas) : "No resources found in default namespace.";
  }

  /* --------------------------------------------------------------- describe */
  function linhaKv(pares) {
    var larg = Math.max.apply(null, pares.map(function (p) { return p[0].length; }));
    return pares.map(function (p) { return p[0] + ":" + new Array(Math.max(2, larg - p[0].length + 2)).join(" ") + p[1]; }).join("\n");
  }

  function describePod(c, p) {
    var s = p.status || {};
    var conds = [["Type", "Status"]];
    var out = [];
    out.push(linhaKv([
      ["Name", p.metadata.name],
      ["Namespace", p.metadata.namespace],
      ["Priority", "0"],
      ["Service Account", (p.spec.serviceAccountName || "default")],
      ["Node", s.no ? s.no + "/192.0.2." + (10 + s.no.length) : "<none>"],
      ["Start Time", "Fri, 27 Nov 2026 15:50:2" + (s.iniciadoEm ? s.iniciadoEm % 9 : 0) + " +0000"],
      ["Labels", Object.keys(p.metadata.labels || {}).sort().map(function (k) { return k + "=" + p.metadata.labels[k]; }).join("\n" + new Array(18).join(" ")) || "<none>"],
      ["Annotations", "<none>"],
      ["Status", s.phase || "Pending"],
      ["IP", s.ip || ""],
      ["IPs", s.ip ? "IP:  " + s.ip : "<none>"],
      ["Controlled By", p.metadata.ownerReferences && p.metadata.ownerReferences[0] ? p.metadata.ownerReferences[0].kind + "/" + p.metadata.ownerReferences[0].name : "<none>"]
    ]));
    out.push("");
    out.push("Containers:");
    (p.spec.containers || []).forEach(function (ct) {
      out.push("  " + ct.name + ":");
      out.push("    Image:          " + ct.image);
      out.push("    Port:           " + ((ct.ports || []).map(function (x) { return x.containerPort + "/" + x.protocol; }).join(", ") || "<none>"));
      out.push("    State:          " + (s.phase === "Running" ? "Running" : s.motivo === "FailedScheduling" ? "Waiting" : "Waiting"));
      if (s.phase === "Running") out.push("      Started:      Fri, 27 Nov 2026 15:50:2" + ((s.iniciadoEm || 0) % 9) + " +0000");
      else out.push("      Reason:       " + (s.motivo || "ContainerCreating"));
      out.push("    Ready:          " + (s.ready ? "True" : "False"));
      out.push("    Restart Count:  " + (s.reinicios || 0));
      if (ct.readinessProbe) out.push("    Readiness:      " + (ct.readinessProbe.httpGet ? "http-get http://:" + (ct.readinessProbe.httpGet.port || 80) + (ct.readinessProbe.httpGet.path || "/") : "exec") + (ct.readinessProbe.periodSeconds ? ", " + ct.readinessProbe.periodSeconds + "s" : ""));
      if (ct.livenessProbe) out.push("    Liveness:       " + (ct.livenessProbe.httpGet ? "http-get http://:" + (ct.livenessProbe.httpGet.port || 80) + (ct.livenessProbe.httpGet.path || "/") : "exec") + (ct.livenessProbe.periodSeconds ? ", " + ct.livenessProbe.periodSeconds + "s" : ""));
      var envTxt = (ct.env || []).map(function (e) {
        return e.name + ": " + (e.value != null ? e.value : "(vindo de " + Object.keys(e.valueFrom || {})[0] + ")");
      }).join("\n                    ");
      out.push("    Environment:    " + (envTxt || "<none>"));
      out.push("    Mounts:         " + ((ct.volumeMounts || []).map(function (m) { return m.name + " from " + m.name + " (" + m.mountPath + ")"; }).join(", ") || "<none>"));
    });
    out.push("Conditions:");
    var cond = s.conditions && s.conditions.length ? s.conditions : [{ tipo: "PodScheduled", status: s.no ? "True" : "False" }, { tipo: "Ready", status: s.ready ? "True" : "False" }];
    var cLinhas = [["Type", "Status"]];
    cond.forEach(function (x) { cLinhas.push([x.tipo, x.status]); });
    out.push(tabela(cLinhas).split("\n").map(function (l) { return "  " + l; }).join("\n"));
    out.push("Volumes:");
    var vols = p.spec.volumes || [{ name: "kube-api-access-" + K.hash36(p.metadata.name, 5), projected: true }];
    vols.forEach(function (v) {
      out.push("  " + v.name + ":");
      if (v.configMap) out.push("    Type:      ConfigMap (a volume populated by a ConfigMap)\n    Name:      " + v.configMap.name);
      else if (v.secret) out.push("    Type:      Secret (a volume populated by a Secret)\n    SecretName:  " + v.secret.secretName);
      else if (v.persistentVolumeClaim) out.push("    Type:       PersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)\n    ClaimName:  " + v.persistentVolumeClaim.claimName);
      else if (v.emptyDir) out.push("    Type:       EmptyDir (a temporary directory that shares a pod's lifetime)");
      else out.push("    Type:      Projected (a volume that contains injected data from multiple sources)");
    });
    out.push("QoS Class:                   " + qosClass(p));
    out.push("Node-Selectors:              " + (Object.keys(p.spec.nodeSelector || {}).map(function (k) { return k + "=" + p.spec.nodeSelector[k]; }).join(",") || "<none>"));
    out.push("Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s");
    out.push("                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s");
    out.push("Events:");
    var evs = c.eventos.filter(function (e) { return e.objeto === "Pod/" + p.metadata.name; });
    if (!evs.length) {
      out.push("  <none>");
    } else {
      var t = [["Type", "Reason", "Age", "From", "Message"]];
      evs.slice(-4).forEach(function (e) { t.push([e.tipo, e.motivo, e.quando, "default-scheduler", e.msg]); });
      out.push(tabela(t).split("\n").map(function (l) { return "  " + l; }).join("\n"));
    }
    return out.join("\n");
  }

  function qosClass(p) {
    var cs = p.spec.containers || [];
    var temReq = cs.every(function (c) { return c.resources && c.resources.requests && Object.keys(c.resources.requests).length; });
    var temLim = cs.every(function (c) { return c.resources && c.resources.limits && Object.keys(c.resources.limits).length; });
    if (!temReq && !temLim) return "BestEffort";
    if (temReq && temLim) return "Guaranteed";
    return "Burstable";
  }

  function describeDeploy(c, d) {
    var s = d.status || {};
    var out = [];
    out.push(linhaKv([
      ["Name", d.metadata.name],
      ["Namespace", d.metadata.namespace],
      ["CreationTimestamp", "Fri, 27 Nov 2026 15:50:21 +0000"],
      ["Labels", Object.keys(d.metadata.labels || {}).sort().map(function (k) { return k + "=" + d.metadata.labels[k]; }).join("\n" + new Array(20).join(" ")) || "<none>"],
      ["Annotations", "deployment.kubernetes.io/revision: \"" + (d.revision || 1) + "\""],
      ["Selector", Object.keys(d.spec.selector.matchLabels || {}).map(function (k) { return k + "=" + d.spec.selector.matchLabels[k]; }).join(",")]
    ]));
    out.push("Pod Template:");
    out.push("  Labels:  " + Object.keys(d.spec.template.metadata.labels || {}).map(function (k) { return k + "=" + d.spec.template.metadata.labels[k]; }).join(","));
    out.push("  Containers:");
    (d.spec.template.spec.containers || []).forEach(function (ct) {
      out.push("   " + ct.name + ":");
      out.push("    Image:        " + ct.image);
      out.push("    Port:         " + ((ct.ports || []).map(function (x) { return x.containerPort + "/" + x.protocol; }).join(", ") || "<none>"));
      out.push("    Environment:  " + ((ct.env || []).map(function (e) { return e.name + ": " + (e.value || ""); }).join("\n                  ") || "<none>"));
      out.push("    Mounts:       " + ((ct.volumeMounts || []).length ? "" : "<none>"));
    });
    out.push("Conditions:");
    var t = [["Type", "Status", "Reason"]];
    (s.conditions || []).forEach(function (x) { t.push([x.type, x.status || "True", x.reason || ""]); });
    out.push(tabela(t).split("\n").map(function (l) { return "  " + l; }).join("\n"));
    out.push("OldReplicaSets:  " + (C.listar(c, "ReplicaSet", d.metadata.namespace).filter(function (r) {
      return r.metadata.ownerReferences && r.metadata.ownerReferences[0].name === d.metadata.name && r.spec.replicas === 0;
    }).map(function (r) { return r.metadata.name; }).join(", ") || "<none>"));
    out.push("NewReplicaSet:   " + (C.listar(c, "ReplicaSet", d.metadata.namespace).filter(function (r) {
      return r.metadata.ownerReferences && r.metadata.ownerReferences[0].name === d.metadata.name && r.spec.replicas > 0;
    }).map(function (r) { return r.metadata.name + " (" + r.spec.replicas + "/" + r.spec.replicas + " replicas created)"; }).join(", ") || "<none>"));
    out.push("Events:");
    var evs = c.eventos.filter(function (e) { return e.objeto === "Deployment/" + d.metadata.name; });
    if (!evs.length) out.push("  <none>");
    else {
      var te = [["Type", "Reason", "Age", "From", "Message"]];
      evs.slice(-4).forEach(function (e) { te.push([e.tipo, e.motivo, e.quando, "deployment-controller", e.msg]); });
      out.push(tabela(te).split("\n").map(function (l) { return "  " + l; }).join("\n"));
    }
    return out.join("\n");
  }

  function describeSvc(c, s) {
    var eps = C.achar(c, "Endpoints", s.metadata.namespace, s.metadata.name);
    var out = [];
    out.push(linhaKv([
      ["Name", s.metadata.name],
      ["Namespace", s.metadata.namespace],
      ["Labels", Object.keys(s.metadata.labels || {}).map(function (k) { return k + "=" + s.metadata.labels[k]; }).join(",") || "<none>"],
      ["Annotations", "<none>"],
      ["Selector", Object.keys(s.spec.selector || {}).map(function (k) { return k + "=" + s.spec.selector[k]; }).join(",")],
      ["Type", s.spec.type],
      ["IP Family Policy", s.spec.ipFamilyPolicy || "SingleStack"],
      ["IP Families", "IPv4"],
      ["IP", s.spec.clusterIP],
      ["IPs", s.spec.clusterIP],
      ["Port", (s.spec.ports || []).map(function (p) { return p.name ? p.name + " " : ""; }).join("") + (s.spec.ports || []).map(function (p) { return p.port + "/" + p.protocol; }).join(",")],
      ["TargetPort", (s.spec.ports || []).map(function (p) { return p.targetPort + "/" + p.protocol; }).join(",")],
      ["Endpoints", (eps.subsets || []).map(function (x) { return (x.addresses || []).map(function (a) { return a.ip + ":" + (x.ports || [{}])[0].port; }).join(","); }).join(",") || "<none>"],
      ["Session Affinity", s.spec.sessionAffinity || "None"]
    ]));
    if (s.spec.type === "LoadBalancer") out.push("LoadBalancer Ingress:   " + ((s.status && s.status.loadBalancer && s.status.loadBalancer.ingress || [{}])[0].ip || "<pending>"));
    out.push("Events:  <none>");
    return out.join("\n");
  }

  function describeGenerico(c, o) {
    var out = [];
    out.push(linhaKv([
      ["Name", o.metadata.name],
      ["Namespace", o.metadata.namespace || ""],
      ["Labels", Object.keys(o.metadata.labels || {}).map(function (k) { return k + "=" + o.metadata.labels[k]; }).join(",") || "<none>"],
      ["Data", o.kind === "ConfigMap" || o.kind === "Secret" ? "\n  " + Object.keys(o.data || {}).map(function (k) { return k + ": " + (o.kind === "Secret" ? o.data[k].length + " bytes" : o.data[k]); }).join("\n  ") : ""],
      ["Events", "<none>"]
    ]));
    return out.join("\n");
  }

  function logsDe(p, container) {
    var cs = p.spec.containers || [];
    var alvo = container ? cs.filter(function (c) { return c.name === container; })[0] : cs[0];
    if (!alvo) return "error: container " + (container || "") + " is not valid for pod " + p.metadata.name;
    if (p.status.phase !== "Running") {
      return "";
    }
    var img = alvo.image || "";
    if (/cardapio|padaria|api/.test(img)) {
      return [
        "Servindo o cardapio na porta 8080",
        "Precos carregados de /config/cardapio.json",
        "conexao com o banco: ok",
        "pedido entregue em 132 ms",
        "GET /cardapio 200 12ms",
        "GET /saude 200 1ms"
      ].join("\n");
    }
    return "127.0.0.1 - - [27/Nov/2026:15:50:21 +0000] \"GET / HTTP/1.1\" 200 615 \"-\" \"curl/8.5.0\"";
  }

  /* --------------------------------------------------------------- comandos */
  function parseComando(txt) {
    var partes = [], atual = "", aspas = null;
    for (var i = 0; i < txt.length; i++) {
      var ch = txt.charAt(i);
      if (aspas) {
        if (ch === aspas) aspas = null; else atual += ch;
      } else if (ch === '"' || ch === "'") aspas = ch;
      else if (/\s/.test(ch)) { if (atual) { partes.push(atual); atual = ""; } }
      else atual += ch;
    }
    if (atual) partes.push(atual);
    return partes;
  }

  function opcoes(partes) {
    var o = { o: null, ns: null, seletor: null, todasNs: false, mostrarLabels: false, comNome: false, container: null };
    var resto = [];
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i];
      if (p === "-n" || p === "--namespace") { o.ns = partes[++i]; continue; }
      if (p === "-A" || p === "--all-namespaces") { o.todasNs = true; continue; }
      if (p === "-o" || p === "--output") { o.o = partes[++i]; continue; }
      if (p === "-l" || p === "--selector") { o.seletor = partes[++i]; continue; }
      if (p === "--show-labels") { o.mostrarLabels = true; continue; }
      if (p === "-c" || p === "--container") { o.container = partes[++i]; continue; }
      if (p.indexOf("--output=") === 0) { o.o = p.split("=")[1]; continue; }
      if (p.indexOf("-o=") === 0) { o.o = p.split("=")[1]; continue; }
      if (p.indexOf("--namespace=") === 0) { o.ns = p.split("=")[1]; continue; }
      if (p.indexOf("--selector=") === 0) { o.seletor = p.split("=")[1]; continue; }
      resto.push(p);
    }
    return { o: o, resto: resto };
  }

  function nsAtual(ctx) { return ctx.ns || "default"; }

  function executar(c, linha, ctx) {
    ctx = ctx || { ns: "default" };
    var partes = parseComando(linha);
    if (!partes.length) return "";
    var cmd = partes[0];
    if (cmd !== "kubectl" && cmd !== "helm" && cmd !== "kind" && cmd !== "minikube") {
      return "comando não reconhecido: " + cmd + " (este terminal só entende kubectl, kind e helm)";
    }
    if (cmd === "helm") return helm(c, partes.slice(1), ctx);
    if (cmd === "kind") return kind(partes.slice(1));
    if (cmd === "minikube") return "minikube não está instalado neste notebook (use kind: kind create cluster)";
    var p = opcoes(partes.slice(1));
    var verbo = p.resto[0] || "";
    var args = p.resto.slice(1);

    if (!verbo) return "kubectl controls the Kubernetes cluster manager.\n\nUsage:\n  kubectl [command]";
    if (verbo === "version") return "Client Version: " + K.VERSAO + "\nKustomize Version: v5.8.1";
    if (verbo === "config") {
      if (args[0] === "current-context") return "kind-guia";
      if (args[0] === "get-contexts") return "CURRENT   NAME        CLUSTER     AUTHINFO    NAMESPACE\n*         kind-guia   kind-guia   kind-guia   default";
      if (args[0] === "view") return "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://127.0.0.1:6443\n  name: kind-guia\ncontexts:\n- context:\n    cluster: kind-guia\n    user: kind-guia\n    namespace: default\n  name: kind-guia\ncurrent-context: kind-guia";
      return "kubectl config: use current-context, get-contexts ou view";
    }
    if (verbo === "cluster-info") return "Kubernetes control plane is running at https://127.0.0.1:6443\nCoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy\n\nTo further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.";
    if (verbo === "api-resources") {
      var linhas = [["NAME", "SHORTNAMES", "APIVERSION", "NAMESPACED", "KIND"]];
      K.RECURSOS.forEach(function (r) {
        linhas.push([r.plural, r.curto.join(","), r.api, String(r.ns), r.kind]);
      });
      return tabela(linhas);
    }
    if (verbo === "explain") {
      var campo = args[0] || "";
      var mapa = {
        "pod": "KIND:       Pod\nVERSION:    v1\n\nDESCRIPTION:\n     Pod is a collection of containers that can run on a host. This resource is\n     created by clients and scheduled onto hosts.",
        "deployment": "KIND:       Deployment\nVERSION:    apps/v1\n\nDESCRIPTION:\n     Deployment enables declarative updates for Pods and ReplicaSets.",
        "deployment.spec.strategy": "KIND:       Deployment\nVERSION:    apps/v1\n\nFIELD: strategy <DeploymentStrategy>\n\nDESCRIPTION:\n     The deployment strategy to use to replace existing pods with new ones.\n\nFIELDS:\n   type\t<string>\n     Type of deployment. Can be \"Recreate\" or \"RollingUpdate\". Default is\n     RollingUpdate.\n\n   rollingUpdate\t<RollingUpdateDeployment>\n     Rolling update config params. Present only if DeploymentStrategyType =\n     RollingUpdate."
      };
      return mapa[campo] || "error: field \"" + campo + "\" does not exist";
    }
    if (verbo === "auth") {
      if (args[0] === "can-i") {
        var verboAcao = args[1] || "", recurso = (args[2] || "").split(".")[0];
        var quem = (args.filter(function (a) { return a.indexOf("--as=") === 0; })[0] || "").replace("--as=", "");
        var r = C.podeFazer ? C.podeFazer(c, quem, verboAcao, recurso, nsAtual(ctx)) : null;
        return r ? (r.permitido ? "yes" : "no") : "no";
      }
      return "kubectl auth: use can-i";
    }
    if (verbo === "top") return "error: Metrics API not available";
    if (verbo === "get") return get(c, p, ctx);
    if (verbo === "describe") return describe(c, p, ctx);
    if (verbo === "logs") return logs(c, p, ctx);
    if (verbo === "apply") return applyCmd(c, p, ctx);
    if (verbo === "create") return createCmd(c, p, ctx);
    if (verbo === "run") return runCmd(c, p, ctx);
    if (verbo === "expose") return exposeCmd(c, p, ctx);
    if (verbo === "delete") return deleteCmd(c, p, ctx);
    if (verbo === "scale") return scaleCmd(c, p, ctx);
    if (verbo === "set") return setCmd(c, p, ctx);
    if (verbo === "rollout") return rolloutCmd(c, p, ctx);
    if (verbo === "label") return labelCmd(c, p, ctx, "labels");
    if (verbo === "annotate") return labelCmd(c, p, ctx, "annotations");
    if (verbo === "exec") return execCmd(c, p, ctx);
    if (verbo === "port-forward") return "Forwarding from 127.0.0.1:" + (args[1] || "8080") + " -> " + (args[2] || "80") + "\nHandling connection for " + (args[1] || "8080");
    if (verbo === "events") return getEventos(c, null, p.o);
    if (verbo === "taint") return taintCmd(c, p, ctx);
    if (verbo === "cordon" || verbo === "uncordon") return "node/" + (args[0] || "") + " " + (verbo === "cordon" ? "cordoned" : "uncordoned");
    if (verbo === "drain") return "node/" + (args[0] || "") + " cordoned\nevicting pod...\nnode/" + (args[0] || "") + " drained";
    if (verbo === "edit") return "error: o editor não abre no painel — use kubectl apply -f para mudar o manifesto (na aula de kubectl edit, a transcrição mostra o editor).";
    if (verbo === "patch") return patchCmd(c, p, ctx);
    return 'error: unknown command "' + verbo + '" for "kubectl"';
  }

  function nomeENs(c, alvo, ctx) {
    var ns = nsAtual(ctx);
    var nome = alvo || "";
    if (nome.indexOf("/") >= 0) {
      var rec = K.recursoPorNome(nome.split("/")[0]);
      return { rec: rec, nome: nome.split("/")[1], ns: ns };
    }
    return { rec: null, nome: nome, ns: ns };
  }

  function get(c, p, ctx) {
    var alvo = p.resto[1] || "";
    var o = p.o;
    if (!alvo) return "error: You must specify the type of resource to get. Use \"kubectl api-resources\" for a complete list of supported resources.";
    var rec = K.recursoPorNome(alvo.split("/")[0]);
    if (!rec) return 'error: the server doesn\'t have a resource type "' + alvo.split("/")[0] + '"';
    var nome = alvo.split("/")[1] || p.resto[2] || null;
    var ns = o.ns || nsAtual(ctx);
    var lista = rec.kind === "Node"
      ? c.nos.map(function (n) { return { kind: "Node", apiVersion: "v1", metadata: { name: n.nome, labels: n.labels }, papel: n.papel }; })
      : C.listar(c, rec.kind, rec.ns ? ns : null);
    if (nome) {
      lista = lista.filter(function (x) { return x.metadata.name === nome; });
      if (!lista.length) return 'Error from server (NotFound): ' + rec.plural + ' "' + nome + '" not found';
      o.comNome = true;
    }
    lista = filtrar(c, rec, lista, o);
    if (!lista.length && rec.kind !== "Namespace") return "No resources found" + (rec.ns ? " in " + ns + " namespace." : ".");
    switch (rec.kind) {
      case "Pod": return getPods(c, lista, o);
      case "Deployment": return getDeploy(c, lista, o);
      case "ReplicaSet": return getRS(c, lista, o);
      case "Service": return getSvcs(c, lista, o);
      case "Endpoints": return getEndpoints(c, lista, o);
      case "Node": return getNos(c, lista, o);
      case "ConfigMap": case "Secret": return getCmOuSecret(c, lista, o, rec.kind);
      case "Event": return getEventos(c, lista, o);
      default: return getGenerico(c, rec, lista, o, rec.kind);
    }
  }

  function describe(c, p, ctx) {
    var alvo = p.resto[1] || "";
    var rec = K.recursoPorNome(alvo.split("/")[0]);
    var nome = alvo.split("/")[1] || p.resto[2];
    if (!rec) return 'error: the server doesn\'t have a resource type "' + alvo + '"';
    if (!nome) return "error: You must specify the name of the resource to describe";
    var ns = p.o.ns || nsAtual(ctx);
    var obj = C.achar(c, rec.kind, rec.ns ? ns : null, nome);
    if (!obj) return 'Error from server (NotFound): ' + rec.plural + ' "' + nome + '" not found';
    if (rec.kind === "Pod") return describePod(c, obj);
    if (rec.kind === "Deployment") return describeDeploy(c, obj);
    if (rec.kind === "Service") return describeSvc(c, obj);
    return describeGenerico(c, obj);
  }

  function logs(c, p, ctx) {
    var nome = p.resto[1];
    var ns = p.o.ns || nsAtual(ctx);
    var pod = C.achar(c, "Pod", ns, nome);
    if (!pod) return 'Error from server (NotFound): pods "' + nome + '" not found';
    return logsDe(pod, p.o.container);
  }

  function applyCmd(c, p, ctx) {
    if (p.resto.indexOf("-f") < 0 && !p.resto.some(function (a) { return a.indexOf("-f") === 0; })) {
      return "error: must specify one of -f and -k";
    }
    var alvo = (p.resto[p.resto.indexOf("-f") + 1] || "").replace(/^["']|["']$/g, "");
    if (!alvo) return "error: must specify one of -f and -k";
    var arquivo = c.arquivos && c.arquivos[alvo];
    if (!arquivo) {
      return 'error: the path "' + alvo + '" does not exist\n(neste painel, os manifestos ficam no editor — no modo terminal use kubectl create/run/expose, ou cole o manifesto no modo manifesto)';
    }
    var y = K.yamlCarregar(arquivo);
    if (y.erro) return "error: error parsing " + alvo + ": error converting YAML to JSON: yaml: " + y.erro;
    var r = C.aplicar(c, y.docs);
    var saida = r.linhas.slice();
    r.erros.forEach(function (e) { saida.push(e); });
    return saida.join("\n") || "error: no objects passed to apply";
  }

  function createCmd(c, p, ctx) {
    var tipo = p.resto[1];
    var ns = p.o.ns || nsAtual(ctx);
    if (!tipo) return "error: must specify one of the create subcommands";
    if (tipo === "namespace" || tipo === "ns") {
      var nomeNs = p.resto[2];
      if (!nomeNs) return "error: exactly one NAME is required";
      if (C.achar(c, "Namespace", null, nomeNs)) return 'Error from server (AlreadyExists): namespaces "' + nomeNs + '" already exists';
      C.aplicar(c, [{ apiVersion: "v1", kind: "Namespace", metadata: { name: nomeNs } }]);
      return "namespace/" + nomeNs + " created";
    }
    if (tipo === "deployment") {
      var nomeDep = p.resto[2];
      var imagem = pegarFlag(p.resto, "--image");
      var replicas = pegarFlag(p.resto, "--replicas");
      if (!nomeDep) return "error: exactly one NAME is required";
      var doc = {
        apiVersion: "apps/v1", kind: "Deployment",
        metadata: { name: nomeDep, namespace: ns, labels: { app: nomeDep } },
        spec: {
          replicas: replicas ? Number(replicas) : 1,
          selector: { matchLabels: { app: nomeDep } },
          template: { metadata: { labels: { app: nomeDep } }, spec: { containers: [{ name: nomeDep, image: imagem || "nginx", ports: [{ containerPort: 80 }] }] } }
        }
      };
      var r = C.aplicar(c, [doc]);
      return (r.erros.length ? r.erros[0] : "deployment.apps/" + nomeDep + " created");
    }
    if (tipo === "configmap") {
      var nomeCm = p.resto[3];
      var literais = p.resto.filter(function (a) { return a.indexOf("--from-literal=") === 0; });
      var dados = {};
      literais.forEach(function (l) { var kv = l.replace("--from-literal=", ""); var i = kv.indexOf("="); dados[kv.slice(0, i)] = kv.slice(i + 1); });
      var docCm = { apiVersion: "v1", kind: "ConfigMap", metadata: { name: nomeCm, namespace: ns }, data: dados };
      var rc = C.aplicar(c, [docCm]);
      return rc.erros.length ? rc.erros[0] : "configmap/" + nomeCm + " created";
    }
    if (tipo === "secret") {
      var sub = p.resto[2];
      var nomeSec = p.resto[3];
      var lit = p.resto.filter(function (a) { return a.indexOf("--from-literal=") === 0; });
      var dadosSec = {};
      lit.forEach(function (l) {
        var kv = l.replace("--from-literal=", ""); var i = kv.indexOf("=");
        dadosSec[kv.slice(0, i)] = window.btoa(kv.slice(i + 1));
      });
      var docSec = { apiVersion: "v1", kind: "Secret", metadata: { name: nomeSec, namespace: ns }, type: "Opaque", data: dadosSec };
      var rs = C.aplicar(c, [docSec]);
      return rs.erros.length ? rs.erros[0] : "secret/" + nomeSec + " created";
    }
    if (tipo === "service") {
      return "error: para criar Service, use kubectl expose ou um manifesto YAML";
    }
    if (tipo === "job") {
      var nomeJob = p.resto[2];
      var imgJob = pegarFlag(p.resto, "--image");
      var docJob = {
        apiVersion: "batch/v1", kind: "Job", metadata: { name: nomeJob, namespace: ns },
        spec: { template: { spec: { restartPolicy: "Never", containers: [{ name: nomeJob, image: imgJob || "busybox" }] } } }
      };
      var rj = C.aplicar(c, [docJob]);
      return rj.erros.length ? rj.erros[0] : "job.batch/" + nomeJob + " created";
    }
    return 'error: unknown command "create ' + tipo + '"';
  }

  function pegarFlag(args, flag) {
    var i = args.indexOf(flag);
    if (i >= 0) return args[i + 1];
    var junto = args.filter(function (a) { return a.indexOf(flag + "=") === 0; })[0];
    return junto ? junto.slice(flag.length + 1) : null;
  }

  function runCmd(c, p, ctx) {
    var nome = p.resto[1];
    var imagem = pegarFlag(p.resto, "--image");
    var ns = p.o.ns || nsAtual(ctx);
    if (!nome) return "error: NAME is required";
    if (!imagem) return "error: --image is required for kubectl run";
    if (!p.resto.some(function (a) { return a.indexOf("--restart=Always") >= 0; })) {
      var doc = { apiVersion: "v1", kind: "Pod", metadata: { name: nome, namespace: ns, labels: { run: nome } }, spec: { containers: [{ name: nome, image: imagem, ports: [{ containerPort: 80 }] }] } };
      var r = C.aplicar(c, [doc]);
      return r.erros.length ? r.erros[0] : "pod/" + nome + " created";
    }
    var docd = {
      apiVersion: "apps/v1", kind: "Deployment",
      metadata: { name: nome, namespace: ns, labels: { run: nome } },
      spec: { replicas: 1, selector: { matchLabels: { run: nome } }, template: { metadata: { labels: { run: nome } }, spec: { containers: [{ name: nome, image: imagem, ports: [{ containerPort: 80 }] }] } } }
    };
    var rd = C.aplicar(c, [docd]);
    return rd.erros.length ? rd.erros[0] : "deployment.apps/" + nome + " created";
  }

  function exposeCmd(c, p, ctx) {
    var tipo = p.resto[1], nome = p.resto[2];
    var ns = p.o.ns || nsAtual(ctx);
    if (tipo !== "deployment" && tipo !== "pod") return "error: use: kubectl expose deployment <nome> --port=80 --target-port=8080";
    var dep = tipo === "deployment" ? C.achar(c, "Deployment", ns, nome) : null;
    if (!dep) return 'Error from server (NotFound): deployments.apps "' + nome + '" not found';
    var porta = Number(pegarFlag(p.resto, "--port") || 80);
    var alvo = Number(pegarFlag(p.resto, "--target-port") || porta);
    var tipoSvc = pegarFlag(p.resto, "--type") || "ClusterIP";
    var svc = { apiVersion: "v1", kind: "Service", metadata: { name: nome, namespace: ns }, spec: { type: tipoSvc, selector: copia(dep.spec.selector.matchLabels), ports: [{ port: porta, targetPort: alvo }] } };
    var r = C.aplicar(c, [svc]);
    return r.erros.length ? r.erros[0] : "service/" + nome + " exposed";
  }

  function deleteCmd(c, p, ctx) {
    var alvo = p.resto[1];
    var ns = p.o.ns || nsAtual(ctx);
    if (!alvo) return "error: resource(s) were provided, but no name was specified";
    if (alvo === "-f" || p.resto.indexOf("-f") >= 0) return "error: no manifesto carregado (use o modo manifesto para deletar por arquivo)";
    var rec = K.recursoPorNome(alvo.split("/")[0]);
    var nome = alvo.split("/")[1] || p.resto[2];
    if (!rec) return 'error: the server doesn\'t have a resource type "' + alvo + '"';
    if (!nome) return "error: resource(s) were provided, but no name was specified";
    var obj = C.achar(c, rec.kind, rec.ns ? ns : null, nome);
    if (!obj) return 'Error from server (NotFound): ' + rec.plural + ' "' + nome + '" not found';
    C.remover(c, obj);
    return C.nomeKubectl(rec.kind) + "/" + nome + " deleted";
  }

  function scaleCmd(c, p, ctx) {
    var alvo = p.resto[1];
    var ns = p.o.ns || nsAtual(ctx);
    var n = Number(pegarFlag(p.resto, "--replicas"));
    var rec = K.recursoPorNome((alvo || "").split("/")[0]);
    var nome = (alvo || "").split("/")[1];
    if (!rec || !nome) return "error: use: kubectl scale deployment/<nome> --replicas=3";
    var obj = C.achar(c, rec.kind, ns, nome);
    if (!obj) return 'Error from server (NotFound): ' + rec.plural + ' "' + nome + '" not found';
    if (isNaN(n)) return "error: --replicas must be an integer";
    obj.spec.replicas = n;
    C.reconciliar(c);
    return C.nomeKubectl(rec.kind) + "/" + nome + " scaled";
  }

  function setCmd(c, p, ctx) {
    var ns = p.o.ns || nsAtual(ctx);
    if (p.resto[1] !== "image") return "error: use: kubectl set image deployment/<nome> <container>=<imagem>";
    var alvo = p.resto[2] || "";
    var par = p.resto[3] || "";
    var rec = K.recursoPorNome(alvo.split("/")[0]);
    var nome = alvo.split("/")[1];
    var obj = rec ? C.achar(c, rec.kind, ns, nome) : null;
    if (!obj) return 'Error from server (NotFound): ' + (alvo || "resource") + ' not found';
    var cn = par.split("=")[0], img = par.split("=").slice(1).join("=");
    var feito = false;
    (obj.spec.template.spec.containers || []).forEach(function (ct) {
      if (ct.name === cn) { ct.image = img; feito = true; }
    });
    if (!feito) return 'error: unable to find container named "' + cn + '"';
    obj.revision = (obj.revision || 1) + 1;
    C.reconciliar(c);
    return C.nomeKubectl(rec.kind) + "/" + nome + " image updated";
  }

  function rolloutCmd(c, p, ctx) {
    var sub = p.resto[1], alvo = p.resto[2] || "";
    var ns = p.o.ns || nsAtual(ctx);
    var rec = K.recursoPorNome(alvo.split("/")[0]);
    var nome = alvo.split("/")[1];
    var dep = rec && rec.kind === "Deployment" ? C.achar(c, "Deployment", ns, nome) : null;
    if (!dep) return 'Error from server (NotFound): deployments.apps "' + (nome || "") + '" not found';
    var st = dep.status || {};
    if (sub === "status") {
      if ((st.readyReplicas || 0) >= dep.spec.replicas) return 'deployment "' + nome + '" successfully rolled out';
      return 'Waiting for deployment "' + nome + '" rollout to finish: ' + (dep.spec.replicas - (st.readyReplicas || 0)) + " of " + dep.spec.replicas + " updated replicas are available...";
    }
    if (sub === "history") {
      var linhas = [["REVISION", "CHANGE-CAUSE"]];
      var rev = dep.revision || 1;
      linhas.push(["1", "<none>"]);
      if (rev > 1) linhas.push([String(rev), "<none>"]);
      return "deployment.apps/" + nome + " \n" + tabela(linhas);
    }
    if (sub === "undo") { C.reconciliar(c); return "deployment.apps/" + nome + " rolled back"; }
    if (sub === "restart") {
      dep.revision = (dep.revision || 1) + 1;
      C.reconciliar(c);
      return "deployment.apps/" + nome + " restarted";
    }
    return "error: use rollout status, history, undo ou restart";
  }

  function labelCmd(c, p, ctx, campo) {
    var alvo = p.resto[1] || "";
    var ns = p.o.ns || nsAtual(ctx);
    var rec = K.recursoPorNome(alvo.split("/")[0]);
    var nome = alvo.split("/")[1];
    var obj = rec ? C.achar(c, rec.kind, ns, nome) : null;
    if (!obj) return 'Error from server (NotFound): "' + alvo + '" not found';
    var par = p.resto[2] || "";
    if (!par) return "error: at least one label update is required";
    var chave = par.split("=")[0], valor = par.split("=")[1];
    obj.metadata[campo] = obj.metadata[campo] || {};
    if (valor === undefined) delete obj.metadata[campo][chave];
    else obj.metadata[campo][chave] = valor;
    C.reconciliar(c);
    return C.nomeKubectl(rec.kind) + "/" + nome + " " + (campo === "labels" ? "labeled" : "annotated");
  }

  function execCmd(c, p, ctx) {
    var nome = p.resto[1];
    var ns = p.o.ns || nsAtual(ctx);
    var pod = C.achar(c, "Pod", ns, nome);
    if (!pod) return 'Error from server (NotFound): pods "' + nome + '" not found';
    if (pod.status.phase !== "Running") return "error: cannot exec into a container in a " + pod.status.phase + " pod";
    var depois = p.resto.indexOf("--");
    var cmd = depois >= 0 ? p.resto.slice(depois + 1).join(" ") : "";
    if (/ls/.test(cmd)) return "app\nconfig\nnode_modules\npackage.json";
    if (/cat/.test(cmd)) return (c.arquivos && c.arquivos["/config/cardapio.json"]) || '{"paes":["francês","de queijo"]}';
    if (/env/.test(cmd)) return "PATH=/usr/local/bin\nNODE_ENV=production\nPORTA=8080";
    if (/sh|bash/.test(cmd)) return "error: o shell interativo não roda no painel — use `kubectl exec <pod> -- <comando>`.";
    return "";
  }

  function taintCmd(c, p, ctx) {
    var alvo = p.resto[1] || "", nome = p.resto[2], efeito = p.resto[3] || "";
    if (alvo !== "nodes" && alvo !== "node" && alvo !== "no") return "error: use: kubectl taint nodes <nó> chave=valor:NoSchedule";
    var no = c.nos.filter(function (n) { return n.nome === nome; })[0];
    if (!no) return 'error: node "' + nome + '" not found';
    no.taints = no.taints || [];
    if (efeito === "-" || (efeito.charAt(0) === "\'" && efeito.slice(-1) === "\'")) {
      var chave = efeito.replace(/^-|\'$/g, "").replace(/\'$/g, "");
      no.taints = no.taints.filter(function (t) { return t.key !== chave; });
      return "node/" + nome + " untainted";
    }
    var partes = efeito.split(":");
    var kv = partes[0].split("=");
    no.taints.push({ key: kv[0], value: kv[1] || "", effect: partes[1] || "NoSchedule" });
    C.reconciliar(c);
    return "node/" + nome + " tainted";
  }

  function patchCmd(c, p, ctx) {
    return "error: neste painel, patch não é aplicado — use kubectl apply -f com o manifesto completo (a aula de patch mostra a saída real).";
  }

  function kind(args) {
    if (args[0] === "get" && args[1] === "clusters") return "guia";
    if (args[0] === "get" && args[1] === "nodes") return "guia-control-plane\nguia-worker\nguia-worker2";
    if (args[0] === "create" && args[1] === "cluster") return "Creating cluster \"guia\" ...\n \u2022 Ensuring node image (kindest/node:v1.37.3) \ud83d\udc33\n \u2022 Preparing nodes \ud83d\udce6\n \u2022 Writing configuration \ud83d\udcdc\n \u2022 Starting control-plane \ud83d\udc77\n \u2022 Installing CNI \ud83d\udc89\n \u2022 Installing StorageClass \ud83d\udce6\nSet kubectl context to \"kind-guia\"\nYou can now use your cluster with:\n\nkubectl cluster-info --context kind-guia";
    if (args[0] === "delete" && args[1] === "cluster") return "Deleting cluster \"guia\" ...\nDeleted nodes: [\"guia-control-plane\" \"guia-worker\" \"guia-worker2\"]";
    return "kind: use get clusters, create cluster ou delete cluster";
  }

  function helm(c, args, ctx) {
    if (!args.length) return "The Kubernetes package manager\n\nUsage:\n  helm [command]";
    if (args[0] === "version") return 'version.BuildInfo{Version:"v3.19.0", GitCommit:"", GitTreeState:"clean", GoVersion:"go1.25.0"}';
    if (args[0] === "list" || args[0] === "ls") {
      var instalados = c.helm || [];
      if (!instalados.length) return "NAME\tNAMESPACE\tREVISION\tUPDATED\t\t\t\t\tSTATUS\tCHART\tAPP VERSION";
      var l = [["NAME", "NAMESPACE", "REVISION", "UPDATED", "STATUS", "CHART", "APP VERSION"]];
      instalados.forEach(function (h) { l.push([h.nome, h.ns, String(h.revisao), "2026-11-27 15:50:21", h.status, h.chart, h.app]); });
      return tabela(l);
    }
    if (args[0] === "install") {
      var nome = args[1], chart = args[2] || "";
      if (!nome) return "Error: \"helm install\" requires 2 arguments";
      c.helm = c.helm || [];
      c.helm.push({ nome: nome, ns: nsAtual(ctx), revisao: 1, status: "deployed", chart: chart + "-0.1.0", app: "1.0.0" });
      return "NAME: " + nome + "\nLAST DEPLOYED: Fri Nov 27 15:50:21 2026\nNAMESPACE: " + nsAtual(ctx) + "\nSTATUS: deployed\nREVISION: 1\nNOTES:\nO cardápio está no ar em http://" + nome + ".loja.test";
    }
    if (args[0] === "upgrade") return 'Release "' + (args[1] || "") + '" has been upgraded. Happy Helming!\nSTATUS: deployed\nREVISION: 2';
    if (args[0] === "uninstall" || args[0] === "delete") return 'release "' + (args[1] || "") + '" uninstalled';
    if (args[0] === "template") return "# Source: " + (args[2] || "app") + "/templates/deployment.yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: " + (args[1] || "release") + "\nspec:\n  replicas: 2";
    if (args[0] === "repo") return "HAPPY  REPO                    URL\n" + "true   bitnami                 https://charts.bitnami.com/bitnami";
    return 'Error: unknown command "' + args[0] + '" for "helm"';
  }

  window.K8sKubectl = {
    tabela: tabela, paraYaml: paraYaml, executar: executar, parseComando: parseComando,
    getPods: getPods, getDeploy: getDeploy, describePod: describePod, logsDe: logsDe, qosClass: qosClass,
    opcoes: opcoes
  };
})();

/* =====================================================================
   RBAC, cenários, metas e a caixa .tryk8s
   ===================================================================== */
(function () {
  "use strict";
  var K = window.K8s, C = window.K8sCluster, KC = window.K8sKubectl;
  var esc = K.esc, norm = K.norm, copia = K.copia;

  /* ------------------------------------------------------------------ RBAC */
  var CLUSTER_ROLES_PRONTAS = {
    "cluster-admin": [{ apiGroups: ["*"], resources: ["*"], verbs: ["*"] }],
    "view": [{ apiGroups: ["", "apps", "batch"], resources: ["pods", "services", "deployments", "replicasets", "configmaps"], verbs: ["get", "list", "watch"] }],
    "edit": [{ apiGroups: ["", "apps", "batch"], resources: ["pods", "services", "deployments", "replicasets", "configmaps", "secrets"], verbs: ["get", "list", "watch", "create", "update", "patch", "delete"] }]
  };

  function regrasDe(c, roleRef, ns) {
    if (roleRef.kind === "ClusterRole") {
      var cr = C.achar(c, "ClusterRole", null, roleRef.name);
      if (cr) return cr.rules || [];
      return CLUSTER_ROLES_PRONTAS[roleRef.name] || [];
    }
    var role = C.achar(c, "Role", ns, roleRef.name);
    return role ? role.rules || [] : [];
  }

  function sujeitosCasam(sujeitos, quem) {
    if (!quem) return false;
    return (sujeitos || []).some(function (s) {
      if (s.kind === "ServiceAccount" && quem.indexOf("system:serviceaccount:") === 0) {
        var partes = quem.replace("system:serviceaccount:", "").split(":");
        return partes[1] === s.name && (s.namespace || "default") === partes[0];
      }
      if (s.kind === "User") return s.name === quem;
      if (s.kind === "Group") return quem === s.name;
      return false;
    });
  }

  function regraPermite(regras, verbo, recurso, grupo) {
    return (regras || []).some(function (r) {
      var verbs = r.verbs || [], res = r.resources || [], grupos = r.apiGroups || [""];
      var okVerbo = verbs.indexOf("*") >= 0 || verbs.indexOf(verbo) >= 0;
      var okRes = res.indexOf("*") >= 0 || res.indexOf(recurso) >= 0 || res.indexOf(recurso + "s") >= 0;
      var okGrupo = grupos.indexOf("*") >= 0 || grupos.indexOf(grupo || "") >= 0;
      return okVerbo && okRes && okGrupo;
    });
  }

  function podeFazer(c, quem, verbo, recurso, ns) {
    var grupo = "";
    var rec = K.recursoPorNome(recurso);
    if (rec && rec.api.indexOf("/") > 0) grupo = rec.api.split("/")[0];
    if (!quem) return { permitido: true, motivo: "usuário admin do cluster" };
    /* bindings de namespace */
    var permitido = false, motivo = "sem regra que permita";
    C.listar(c, "RoleBinding", ns).forEach(function (rb) {
      if (!sujeitosCasam(rb.subjects, quem)) return;
      if (regraPermite(regrasDe(c, rb.roleRef, ns), verbo, rec ? rec.plural : recurso, grupo)) { permitido = true; motivo = "RoleBinding/" + rb.metadata.name; }
    });
    C.listar(c, "ClusterRoleBinding", null).forEach(function (crb) {
      if (!sujeitosCasam(crb.subjects, quem)) return;
      if (regraPermite(regrasDe(c, crb.roleRef, ns), verbo, rec ? rec.plural : recurso, grupo)) { permitido = true; motivo = "ClusterRoleBinding/" + crb.metadata.name; }
    });
    return { permitido: permitido, motivo: motivo };
  }

  /* -------------------------------------------------------------- cenários */
  /* um cenário é um estado de cluster já pronto: o painel mostra o que existe,
     e as aulas usam isso para falar de pod que não sobe, service sem endpoint... */
  var CENARIOS = {
    padaria: function (c) {
      C.aplicar(c, [{
        apiVersion: "apps/v1", kind: "Deployment",
        metadata: { name: "cardapio", labels: { app: "cardapio" } },
        spec: { replicas: 2, selector: { matchLabels: { app: "cardapio" } }, template: { metadata: { labels: { app: "cardapio" } }, spec: { containers: [{ name: "web", image: "cardapio:1.0", ports: [{ containerPort: 8080 }] }] } } }
      }, {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "cardapio" },
        spec: { selector: { app: "cardapio" }, ports: [{ port: 80, targetPort: 8080 }] }
      }]);
    },
    "pod-pendente": function (c) {
      C.aplicar(c, [{
        apiVersion: "v1", kind: "Pod",
        metadata: { name: "forno", labels: { app: "forno" } },
        spec: { containers: [{ name: "forno", image: "forno:1.0", resources: { requests: { cpu: "8", memory: "16Gi" } } }] }
      }]);
    },
    "sem-endpoint": function (c) {
      C.aplicar(c, [{
        apiVersion: "apps/v1", kind: "Deployment",
        metadata: { name: "cardapio" },
        spec: { replicas: 1, selector: { matchLabels: { app: "cardapio" } }, template: { metadata: { labels: { app: "cardapio" } }, spec: { containers: [{ name: "web", image: "cardapio:1.0" }] } } }
      }, {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "cardapio" },
        spec: { selector: { app: "vitrine" }, ports: [{ port: 80 }] }
      }]);
    }
  };

  function montarCluster(cfg) {
    var c = C.novo();
    c.arquivos = cfg.arquivos || {};
    if (cfg.cenario && CENARIOS[cfg.cenario]) CENARIOS[cfg.cenario](c);
    if (window.K8sCenario && window.K8sCenario.metricaAtual) c.metricaAtual = window.K8sCenario.metricaAtual;
    return c;
  }

  /* -------------------------------------------------------------- os passos */
  var PASSOS = {
    texto: "trecho do painel: texto:cardapio-",
    erro: "mensagem de erro do painel: erro:Required value",
    objeto: "o objeto existe: objeto:Deployment/cardapio",
    campo: "campo do objeto: campo:Deployment/cardapio|spec.replicas=2",
    conta: "quantos existem: conta:pods=2 ou conta:pods[app=cardapio]=2",
    pronto: "réplicas prontas: pronto:Deployment/cardapio=2"
  };

  function lerCaminho(obj, caminho) {
    return String(caminho || "").split(".").reduce(function (o, k) {
      if (o == null) return undefined;
      if (/^\d+$/.test(k)) return o[Number(k)];
      return o[k];
    }, obj);
  }

  function avaliar(cluster, painel, meta) {
    var passos = String(meta || "").split(";;").map(function (p) { return p.trim(); }).filter(Boolean);
    if (!passos.length) return { ok: false, motivo: "a caixa não tem meta (data-goal)" };
    var alvo = norm(painel);
    for (var i = 0; i < passos.length; i++) {
      var passo = passos[i], dois = passo.indexOf(":");
      var nome = dois < 0 ? passo : passo.slice(0, dois);
      var valor = dois < 0 ? "" : passo.slice(dois + 1);
      if (nome === "texto") {
        if (alvo.indexOf(norm(valor)) < 0) return { ok: false, motivo: 'o painel não tem "' + valor + '"' };
      } else if (nome === "erro") {
        if (alvo.indexOf(norm(valor)) < 0) return { ok: false, motivo: 'a saída não traz o erro "' + valor + '"' };
      } else if (nome === "objeto") {
        var p = valor.split("/"), rec = K.recursoPorNome(p[0]);
        if (!rec) return { ok: false, motivo: 'recurso desconhecido em objeto:' + valor };
        if (!C.achar(cluster, rec.kind, cluster.nsCorrente || "default", p[1])) {
          return { ok: false, motivo: "não existe " + rec.kind + "/" + p[1] + " no namespace " + (cluster.nsCorrente || "default") };
        }
      } else if (nome === "campo") {
        var par = valor.split("|"), alvoObj = par[0].split("/"), caminho = par[1] || "";
        var igual = caminho.indexOf("=");
        var esperado = igual < 0 ? "" : caminho.slice(igual + 1);
        var campo = igual < 0 ? caminho : caminho.slice(0, igual);
        var rec2 = K.recursoPorNome(alvoObj[0]);
        var obj = rec2 ? C.achar(cluster, rec2.kind, cluster.nsCorrente || "default", alvoObj[1]) : null;
        if (!obj) return { ok: false, motivo: "não existe " + par[0] };
        var achado = lerCaminho(obj, campo);
        if (String(achado) !== esperado) {
          return { ok: false, motivo: par[0] + " " + campo + " = " + JSON.stringify(achado) + " (esperado " + esperado + ")" };
        }
      } else if (nome === "conta") {
        var m = /^([a-z]+)(?:\[([^\]]+)\])?=(\d+)$/.exec(valor);
        if (!m) return { ok: false, motivo: "conta: precisa de recurso=n (ex.: conta:pods=2)" };
        var rec3 = K.recursoPorNome(m[1]);
        if (!rec3) return { ok: false, motivo: "recurso desconhecido em conta:" + m[1] };
        var lista = C.listar(cluster, rec3.kind, cluster.nsCorrente || "default");
        if (m[2]) {
          var sel = C.seletorDeTexto(m[2]);
          lista = lista.filter(function (o) { return Object.keys(sel).every(function (k) { return String((o.metadata.labels || {})[k]) === sel[k]; }); });
        }
        if (lista.length !== Number(m[3])) {
          return { ok: false, motivo: "existem " + lista.length + " " + m[1] + (m[2] ? "[" + m[2] + "]" : "") + " (esperado " + m[3] + ")" };
        }
      } else if (nome === "pronto") {
        var p2 = valor.split("/"), rec4 = K.recursoPorNome(p2[0]);
        var o2 = rec4 ? C.achar(cluster, rec4.kind, cluster.nsCorrente || "default", p2[1]) : null;
        if (!o2) return { ok: false, motivo: "não existe " + valor };
        var prontas = (o2.status && (o2.status.readyReplicas != null ? o2.status.readyReplicas : o2.status.ready)) || 0;
        var alvoN = Number(String(valor).split("=").pop());
        if (prontas !== alvoN) return { ok: false, motivo: valor.split("=")[0] + " tem " + prontas + " prontas (esperado " + alvoN + ")" };
      } else {
        return { ok: false, motivo: 'passo de meta desconhecido: "' + passo + '" (use ' + Object.keys(PASSOS).join(", ") + ")" };
      }
    }
    return { ok: true, motivo: "" };
  }

  /* ------------------------------------------------------------ rodar a caixa */
  function rodar(cfg) {
    var cluster = montarCluster(cfg);
    cluster.nsCorrente = cfg.ns || "default";
    var saida;
    if (cfg.modo === "terminal") {
      var linhas = String(cfg.codigo || "").split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== "#"; });
      var partes = [];
      linhas.forEach(function (l) {
        var r = KC.executar(cluster, l, { ns: cluster.nsCorrente });
        partes.push("ana@notebook:~$ " + l);
        if (r) partes.push(r);
        partes.push("");
      });
      saida = partes.join("\n").replace(/\n+$/, "");
      if (!saida) saida = "ana@notebook:~$ ";
      /* o kubectl create namespace muda o namespace corrente do exercício? não:
         o leitor usa -n; manter o default é o comportamento real da sessão. */
      C.reconciliar(cluster);
    } else {
      var y = K.yamlCarregar(cfg.codigo || "");
      if (y.erro) {
        saida = "error: error parsing cardapio.yaml: error converting YAML to JSON: yaml: line " + (y.erro.match(/line (\d+)/) ? y.erro.match(/line (\d+)/)[1] : "1") + ": " + y.erro.replace(/^line \d+: /, "");
      } else if (!y.docs.length) {
        saida = "error: no objects passed to apply";
      } else {
        var r = C.aplicar(cluster, y.docs);
        var bloco = r.linhas.slice();
        r.erros.forEach(function (e) { bloco.push(e); });
        if (!r.erros.length) {
          var kinds = {};
          r.aplicados.forEach(function (o) { var rec = K.recursoPorNome(o.kind); kinds[rec.kind] = rec.plural; });
          var pedido = cfg.get || Object.keys(kinds).map(function (k) { return kinds[k]; }).join(",");
          if (pedido) {
            bloco.push("");
            bloco.push(KC.executar(cluster, "kubectl get " + pedido, { ns: cluster.nsCorrente }));
          }
        }
        saida = bloco.join("\n");
      }
    }
    var av = avaliar(cluster, saida, cfg.meta);
    return { saida: saida, ok: av.ok, motivo: av.motivo, cluster: cluster };
  }

  /* ---------------------------------------------------------------- a caixa */
  function montarCaixa(caixa) {
    if (caixa.getAttribute("data-pronto") === "1") return;
    caixa.setAttribute("data-pronto", "1");

    var fonte = caixa.querySelector("pre.yaml");
    var alvo = caixa.querySelector("pre.out");
    var solucao = caixa.querySelector("pre.solucao");
    if (!fonte || !alvo) return;

    var modo = caixa.getAttribute("data-modo") || "manifesto";
    var meta = caixa.getAttribute("data-goal") || "";
    var cenario = caixa.getAttribute("data-cenario") || "";
    var get = caixa.getAttribute("data-get") || "";
    var ns = caixa.getAttribute("data-ns") || "default";

    var original = fonte.textContent;
    fonte.setAttribute("contenteditable", "true");
    fonte.setAttribute("spellcheck", "false");
    fonte.setAttribute("role", "textbox");
    fonte.setAttribute("aria-label", modo === "terminal" ? "Comandos kubectl" : "Manifesto YAML");

    var nome = document.createElement("p");
    nome.className = "try-nome";
    nome.textContent = modo === "terminal" ? "terminal · ana@notebook" : (fonte.getAttribute("data-file") || "cardapio.yaml");

    var barra = document.createElement("div");
    barra.className = "try-bar";
    barra.innerHTML =
      '<button type="button" class="try-rodar">Rodar</button>' +
      '<button type="button" class="try-verificar secondary">Verificar</button>' +
      '<button type="button" class="try-solucao secondary">Ver solução</button>' +
      '<button type="button" class="try-restaurar secondary">Restaurar</button>' +
      '<span class="try-largura">Kubernetes ' + K.VERSAO + "</span>";

    var status = document.createElement("p");
    status.className = "try-status";
    status.setAttribute("aria-live", "polite");

    caixa.insertBefore(nome, fonte);
    caixa.insertBefore(barra, alvo);
    caixa.appendChild(status);

    function cfg() {
      return {
        modo: modo, meta: meta, cenario: cenario, get: get, ns: ns,
        codigo: fonte.textContent.replace(/\u00a0/g, " ").replace(/\s+$/, ""),
        arquivos: {}
      };
    }
    function pintar(texto, erro) {
      alvo.innerHTML = "";
      var pre = document.createElement("span");
      pre.textContent = texto;
      if (erro) pre.className = "m-err";
      alvo.appendChild(pre);
    }
    function rodarAgora() {
      var r = rodar(cfg());
      pintar(r.saida, /^error|is invalid|NotFound/.test(r.saida));
      return r;
    }

    barra.querySelector(".try-rodar").addEventListener("click", function () {
      rodarAgora();
      status.className = "try-status";
      status.textContent = "";
    });
    barra.querySelector(".try-verificar").addEventListener("click", function () {
      var r = rodarAgora();
      if (r.ok) {
        status.className = "try-status ok";
        status.textContent = "isso: o cluster ficou como a missão pede.";
      } else {
        status.className = "try-status falhou";
        status.textContent = "ainda não: " + r.motivo;
      }
    });
    barra.querySelector(".try-solucao").addEventListener("click", function () {
      if (!solucao) return;
      fonte.textContent = solucao.textContent.replace(/^\n/, "");
      rodarAgora();
      status.className = "try-status";
      status.textContent = "solução carregada no editor — clique em Verificar.";
    });
    barra.querySelector(".try-restaurar").addEventListener("click", function () {
      fonte.textContent = original;
      alvo.innerHTML = "";
      var vazio = document.createElement("span");
      vazio.className = "m-vazio";
      vazio.textContent = "(clique em Rodar para aplicar)";
      alvo.appendChild(vazio);
      status.className = "try-status";
      status.textContent = "";
    });

    if (!alvo.textContent.trim()) {
      alvo.innerHTML = '<span class="m-vazio">(clique em Rodar para aplicar)</span>';
    }
  }

  function iniciar() {
    var caixas = document.querySelectorAll(".tryk8s");
    for (var i = 0; i < caixas.length; i++) montarCaixa(caixas[i]);
    window.__k8sPronto = true;
  }

  window.__k8sRodar = function (codigo, modo, extras) {
    var cfg = { codigo: codigo, modo: modo || "manifesto", meta: "", cenario: (extras && extras.cenario) || "", get: (extras && extras.get) || "" };
    return rodar(cfg).saida;
  };
  window.__k8sEstado = function (codigo, modo, extras) {
    var cfg = { codigo: codigo, modo: modo || "manifesto", meta: "", cenario: (extras && extras.cenario) || "", get: (extras && extras.get) || "" };
    var r = rodar(cfg);
    return { saida: r.saida, objs: r.cluster.objs, eventos: r.cluster.eventos, nos: r.cluster.nos };
  };
  window.__k8sAvaliar = function (codigo, meta, modo, extras) {
    var cfg = { codigo: codigo, modo: modo || "manifesto", meta: meta || "", cenario: (extras && extras.cenario) || "", get: (extras && extras.get) || "" };
    var r = rodar(cfg);
    return { ok: r.ok, motivo: r.motivo, saida: r.saida };
  };

  window.K8sSim = { rodar: rodar, avaliar: avaliar, podeFazer: podeFazer, CENARIOS: CENARIOS, PASSOS: PASSOS };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
