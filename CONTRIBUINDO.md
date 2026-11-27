# CONTRIBUINDO — Guia Kubernetes

Este arquivo é o contrato. Se a sua página cumprir o que está aqui, os testadores passam; se passar nos
testadores, ela entra no guia.

## 1. Toda página é uma aula (ou projeto, ou referência)

Arquivo `.html` **na raiz** do repositório, com o nome exato que está na `NIVEIS` (`assets/site.js`).

| item | aula | projeto (`projeto-*`) | referência (`ref-*`) |
|---|---|---|---|
| `<h2>` de conteúdo | 10, numerados `1.` … `10.` | 9 | 8 |
| `<h2>Resumo</h2>` | 1 (depois do exercício) | 1 | 1 |
| `dl.anatomy` | 1 | 2 | 1 |
| `pre.term` | 2 | 3 | 2 |
| `div.cenario` | 3 | 3 | **0** |
| `table.ref` (dentro de `.table-wrap`) | 2 | 3 | 4 |
| `div.mc` (`data-answer`) | 3 | 3 | **0** |
| `div.exercise` | 1 | 1 | **0** |
| `div.pager` | 2 (começo e fim) | 2 | 2 |
| `div.tryk8s` | 3 | 3 | 2 |
| `div.note` | 1 ("Você vai aprender") | 1 | 1 |
| palavras visíveis | 2.800 a 4.000 | 2.800 a 4.000 | 2.800 a 4.000 |

Além disso: `<!doctype html>`, `lang="pt-BR"`, `<title>` terminando em ` | Guia Kubernetes`,
`<meta name="description">` de 100 a 180 caracteres, favicon `data:,`, `assets/style.css`, o script do
tema no `<head>`, `.layout > nav.sidebar#sidebar + main.main > .content` e `assets/site.js` antes de
`</body>` (não carregue `js-yaml`/`k8ssim` à mão: o `site.js` faz isso quando a página tem `.tryk8s`).

O modelo aprovado é **`primeiro-pod.html`**: copie a estrutura, o tom e a profundidade dele.

## 2. A caixa que aplica o manifesto

```html
<div class="tryk8s" data-goal="conta:pods=1;;texto:Running">
  <p class="try-task">Troque a imagem para <code>cardapio:1.0</code> e rode.</p>
  <pre class="yaml">apiVersion: v1
kind: Pod
metadata:
  name: cardapio
spec:
  containers:
    - name: web
      image: nginx:1.29</pre>
  <pre class="out">
</pre>
  <pre class="solucao">apiVersion: v1
kind: Pod
metadata:
  name: cardapio
spec:
  containers:
    - name: web
      image: cardapio:1.0</pre>
</div>
```

- `pre.yaml` — **o editor** (o leitor edita e clica em Rodar). Escapar `<`, `>` e `&`.
- `pre.out` — **não escreva à mão**: `node tools/verificar-saidas.js --fix pagina.html` grava o que o
  motor devolve.
- `pre.solucao` — o código que cumpre a meta. É o que o botão "Ver solução" carrega.
- `data-goal` — a meta (veja a tabela abaixo). O **código inicial tem de falhar** e a **solução tem de
  cumprir** a meta.
- `data-modo="terminal"` — o editor passa a ser uma lista de comandos (um por linha); o painel mostra a
  sessão (`ana@notebook:~$ comando` + resposta), como um terminal de verdade.
- `data-get="pods"` — no modo manifesto, o que o painel roda depois do `apply` (padrão: os tipos
  aplicados, na ordem em que aparecem).
- `data-cenario="padaria|pod-pendente|sem-endpoint"` — começa o cluster com um estado pronto (aula que
  fala de algo que já existe).
- `data-ns="padaria"` — namespace corrente do exercício (padrão `default`).

### A meta (`data-goal`)

Passos separados por `;;`, na ordem. Todos precisam passar.

| passo | exemplo | confere |
|---|---|---|
| `texto:` | `texto:cardapio created` | o painel contém o trecho |
| `erro:` | `erro:Required value` | o painel contém o erro (para aula de erro) |
| `objeto:` | `objeto:Deployment/cardapio` | o objeto existe depois de rodar |
| `campo:` | `campo:Service/web\|spec.type=NodePort` | campo do objeto (caminho com pontos) |
| `conta:` | `conta:pods=2` ou `conta:pods[app=cardapio]=2` | quantos objetos existem |
| `pronto:` | `pronto:Deployment/cardapio=2` | réplicas prontas |

Regra de ouro: **a meta descreve o estado consertado**. A caixa começa quebrada (a imagem errada, o
manifesto inválido, o seletor que não casa) e o leitor arruma até a meta passar.

### Limites do motor (diga isso na aula quando for o caso)

- O painel não roda container: status como `CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled` e logs da
  aplicação **não** são calculados. Quando a aula precisar deles, use `pre.term` com a transcrição real e
  diga que é transcrição.
- Sem rede: Ingress/DNS são modelo (quem descreve o roteamento é o manifesto, não o tráfego).
- Probes aparecem no manifesto e no `describe`, mas quem decide "pronto" no motor é o agendamento.
- HPA calcula réplicas pela métrica semeada, não por medição real.
- `kubectl exec`, `port-forward`, `top`, `edit` e `patch` têm resposta curta e explicativa — não invente
  saída que o motor não dá.

## 3. Estilo de escrita

- A **Ana** é a dona da padaria; o site dela é o fio condutor de todas as aulas.
- Ideia antes do código: analogia longa (2–3 parágrafos), depois o manifesto, depois a resposta.
- Toda saída mostrada tem de ser **real**: ou veio do motor (caixa), ou é transcrição de cluster (diga
  qual). Nunca invente uma tabela de `kubectl get`.
- `pre.term` é texto cru: **nunca** use `<` dentro (use `&lt;` se precisar do caractere).
- `pre.file` (`data-file="deployment.yaml"`) para arquivo grande que não é editável na caixa.
- Erros reais traduzidos: mostre a frase em inglês e diga o que fazer.
- Nada de "TODO", "PREENCHER", "lorem".

## 4. Privacidade

Só `ana@notebook`, `/home/ana`, `America/Sao_Paulo`, `loja.test` e `192.0.2.10` (documentação).
Nunca: nome real, `/home/<outra-pessoa>`, IP de VPS, MAC, SSID, hostname de nuvem.

## 5. O ciclo de trabalho (por página)

```bash
export PATH=/home/wallyson/.local/node22/bin:$PATH
cd /home/wallyson/guia-kubernetes-novo
node tools/k8s.js pagina.html                 # roda as caixas e mostra o painel
node tools/testar-missoes.js pagina.html      # contrato + metas (0 FALHA é o alvo)
node tools/verificar-saidas.js --fix pagina.html
node tools/verificar-saidas.js -q pagina.html
node tools/testar-navegador.js pagina.html    # cliques, 375 px, console
```

`node tools/conferir.js` prova que o motor responde como um cluster real (21 casos). Não mexa em
`assets/`, `tools/`, `index.html` nem em páginas de outros autores. **Nunca** use git.
