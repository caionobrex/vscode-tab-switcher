# VS Code Tab Switcher

Extensão para o Chrome que faz o **Ctrl+Tab** funcionar como no VS Code: as abas são alternadas na **ordem de uso recente** (MRU), com uma lista na tela enquanto você segura o Ctrl.

```
┌──────────────────────────────────────────────┐
│ ABAS RECENTES                                │
│   ◼ Pull requests · GitHub       github.com  │
│ ▶ ◼ Dashboard                   localhost    │  ← selecionada
│   ◼ Documentação da API          docs.dev    │
│   ◼ Caixa de entrada             gmail.com   │
└──────────────────────────────────────────────┘
```

## Como funciona

| Ação | Resultado |
|---|---|
| `Ctrl+Tab` e soltar | Volta para a aba anterior. Repetir alterna entre as duas últimas abas. |
| Segurar `Ctrl` e apertar `Tab` várias vezes | Abre a lista de abas recentes e desce a seleção a cada aperto. |
| `Ctrl+Shift+Tab` (com o Ctrl seguro) | Sobe a seleção na lista. |
| Soltar o `Ctrl` | Vai para a aba selecionada. |
| `Ctrl+Esc` | Cancela e continua na aba atual. |
| Clicar num item da lista | Vai direto para aquela aba. |

- A ordem é separada por janela.
- As abas por onde a seleção passou não mudam de posição: só a escolhida vai para o topo.
- O painel segue o tema claro ou escuro do sistema.

## Instalação

### 1. Carregar a extensão

1. Clone o repositório:
   ```bash
   git clone https://github.com/caionobrex/vscode-tab-switcher.git
   ```
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta `vscode-tab-switcher`.
4. Copie o **ID** que aparece no card da extensão. Ele é usado no próximo passo.

Nesse ponto a extensão já funciona com o atalho padrão: `Ctrl+Q` no Mac e `Alt+Q` no Windows/Linux.

### 2. Usar o Ctrl+Tab de verdade

A tela de atalhos do Chrome (`chrome://extensions/shortcuts`) não aceita o `Ctrl+Tab`. Dá para gravá-lo mesmo assim por uma API interna que só existe no console da página de extensões:

1. Em `chrome://extensions`, clique com o botão direito na página → **Inspecionar** → aba **Console**.
2. Cole o script abaixo, trocando `SEU_ID_AQUI` pelo ID copiado no passo anterior:

   ```js
   {
     const id = "SEU_ID_AQUI";
     for (const [commandName, keybinding] of [
       ["mru-next", "Ctrl+Tab"],
       ["mru-prev", "Ctrl+Shift+Tab"],
     ]) {
       chrome.developerPrivate
         .updateExtensionCommand({ extensionId: id, commandName, keybinding })
         .then(() => console.log("ok:", commandName, keybinding))
         .catch((e) => console.log("erro:", commandName, keybinding, e.message));
     }
   }
   ```

3. Recarregue `chrome://extensions/shortcuts` e confira se os dois atalhos aparecem preenchidos.

> **No Mac:** o Chrome trata `Ctrl` como a tecla **Command** em alguns casos e usa `MacCtrl` para o Control. Se o atalho aparecer como `⌘Tab` ou ficar **Not set**, rode o script de novo trocando `Ctrl` por `MacCtrl`.

> Se você mexer nos atalhos dessa extensão pela tela `chrome://extensions/shortcuts`, ela pode apagar o `Ctrl+Tab`. Basta rodar o script de novo.

### Alternativa no Mac: Karabiner-Elements

Se o script do console não funcionar no seu Chrome, use o [Karabiner-Elements](https://karabiner-elements.pqrs.org/). Ele troca o `Ctrl+Tab` por `Ctrl+Q` somente quando o Chrome está em primeiro plano. Para você, o atalho continua sendo o Ctrl+Tab.

```bash
mkdir -p ~/.config/karabiner/assets/complex_modifications
cp karabiner-chrome-ctrl-tab.json ~/.config/karabiner/assets/complex_modifications/
```

No Karabiner, vá em **Complex Modifications → Add predefined rule** e ative **"Chrome: Ctrl+Tab no estilo VS Code"**. Na primeira vez, libere as permissões de **Monitoramento de entrada** e **Acessibilidade** em Ajustes do Sistema → Privacidade e Segurança.

Não use as duas soluções juntas: com a regra do Karabiner ativa, o Ctrl+Tab nunca chega ao Chrome como Ctrl+Tab.

## Limitações

- **Páginas especiais** (`chrome://`, Nova aba, Chrome Web Store): o Chrome não deixa extensões desenharem nelas. Partindo de uma dessas páginas, cada aperto troca de aba direto, sem a lista, e a escolha é confirmada ao soltar o Ctrl ou após 1,5 s.
- **Foco na barra de endereço:** a página não percebe quando o Ctrl é solto. A aba selecionada é escolhida sozinha após 6 s.
- **Abas abertas antes da instalação:** a extensão é injetada nelas na instalação. Se alguma não mostrar a lista, recarregue a página.

## Permissões

| Permissão | Para quê |
|---|---|
| `tabs` | Ler título e endereço das abas para montar a lista. |
| `storage` | Guardar a ordem de uso recente enquanto o navegador está aberto. |
| `scripting` + acesso a todos os sites | Detectar quando o Ctrl é solto e desenhar a lista sobre a página. |
| `favicon` | Mostrar o ícone de cada site na lista. |

A extensão não faz nenhuma requisição de rede e não envia dados para lugar nenhum.

## Solução de problemas

Em `chrome://extensions`, clique no link **service worker** da extensão para abrir o console. Erros aparecem com o prefixo `[mru]`.

- **Nada acontece ao apertar o atalho:** confira em `chrome://extensions/shortcuts` se o atalho está preenchido.
- **A lista não aparece:** veja se você está numa página especial (ver [Limitações](#limitações)) ou recarregue a aba.
- **Mudou o código:** clique em **recarregar** (↻) no card da extensão.

## Estrutura

| Arquivo | Conteúdo |
|---|---|
| `manifest.json` | Manifest V3: permissões e os comandos `mru-next` / `mru-prev`. |
| `background.js` | Service worker. Mantém a ordem de uso recente e controla o ciclo de troca. |
| `content.js` | Roda nas páginas. Detecta o Ctrl solto e o Esc, e desenha a lista. |
| `karabiner-chrome-ctrl-tab.json` | Regra do Karabiner para a alternativa no Mac. |
