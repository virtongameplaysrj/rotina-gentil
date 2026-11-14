# Rotina Gentil — como testar e instalar (guia para iniciantes)

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app. É este que você abre. |
| `app.js` | As telas e os botões. |
| `scheduler.js` | O "cérebro" que monta a agenda e calcula as barras de necessidades. |
| `data.js` | Listas de sugestões (tarefas, áreas de lazer, frases). Dá para editar no Bloco de Notas. |
| `styles.css` | Cores, tamanhos e aparência. |
| `manifest.webmanifest`, `sw.js`, `icons/` | Fazem o app poder ser instalado no celular e funcionar sem internet. |
| `tests.html` | Testes automáticos do cérebro da agenda. Abra para ver se está tudo ✔. |

---

## Parte 1 — Testar no PC (2 minutos, não precisa instalar nada)

Você só precisa do **Google Chrome** (ou do Microsoft Edge, que já vem no Windows).

1. Abra a pasta `rotina-gentil`.
2. Clique com o botão direito em **`index.html`** → **Abrir com** → **Google Chrome** (ou Microsoft Edge).
3. Pronto: o app abre. Faça o cadastro e use normalmente.

**Para ver como ficaria no celular:**

4. Com o app aberto, aperte **F12** (abre as "Ferramentas do desenvolvedor").
5. Aperte **Ctrl + Shift + M**. A tela vira um "celular".
6. No topo, escolha um modelo (por exemplo, "Pixel 7" ou "Samsung Galaxy S20").
7. Aperte **F5** para recarregar. Para sair desse modo, aperte F12 de novo.

> Os dados ficam salvos no navegador do PC. O celular terá os dados dele, separados.
> Para levar os dados de um aparelho para o outro: **Ajustes → Salvar cópia** em um e **Restaurar cópia** no outro.

**Ver os testes automáticos:** abra `tests.html` do mesmo jeito. Todas as linhas devem aparecer com ✔.

---

## Parte 2 — Instalar no celular Android (grátis, uns 10 minutos)

O celular não consegue abrir um arquivo do seu PC. Por isso, primeiro você coloca o app em um
endereço de internet (grátis). Depois o Chrome do celular instala o app a partir desse endereço.

### Passo A — Colocar o app na internet (Netlify, grátis)

1. No PC, acesse **https://app.netlify.com/drop**
2. Crie uma conta grátis (pode usar "Sign up with Google" ou e-mail).
3. Na página do "Drop", **arraste a pasta `rotina-gentil` inteira** para o quadrado tracejado.
4. Espere uns segundos. Vai aparecer um endereço parecido com
   `https://nome-aleatorio-123.netlify.app`. Esse é o endereço do seu app.
5. (Opcional) Em **Site configuration → Change site name**, troque para algo como `minha-rotina-gentil`.

> Ninguém vai encontrar seu app se você não passar o endereço. E os **seus dados não vão para a internet**:
> eles ficam só no celular. Na internet fica só o "programa", sem nenhuma informação sua.

### Passo B — Instalar no celular

1. No celular Android, abra o **Chrome**.
2. Digite o endereço do Passo A (ex.: `https://minha-rotina-gentil.netlify.app`).
3. Toque nos **três pontinhos ⋮** (canto superior direito).
4. Toque em **"Instalar app"** (em alguns celulares aparece **"Adicionar à tela inicial"** → **Instalar**).
5. Pronto: o ícone 🌱 **Rotina Gentil** aparece na tela do celular, como qualquer outro app.
   Ele abre em tela cheia e funciona **sem internet**.

### Quando eu mudar alguma coisa no app, como atualizo?

1. Entre em https://app.netlify.com → clique no seu site → aba **Deploys**.
2. Arraste a pasta `rotina-gentil` de novo para a área "Drag and drop".
3. No celular, abra o app com internet ligada, feche e abra de novo. Pronto, atualizado.
   Seus dados continuam lá.

---

## Parte 3 (opcional) — Gerar um arquivo .APK "de verdade"

Só é necessário se você quiser mandar o arquivo de instalação para alguém ou, no futuro, publicar na Google Play.
Para uso próprio, a Parte 2 já basta.

1. Acesse **https://www.pwabuilder.com**
2. Cole o endereço do seu app (do Netlify) e clique em **Start**.
3. Clique em **Package For Stores** → **Android** → **Generate Package** → **Download**.
4. Vai baixar um arquivo `.zip`. Dentro dele há um arquivo terminado em **`.apk`**.
5. Envie esse `.apk` para o celular (Google Drive, WhatsApp para você mesmo, cabo USB…).
6. No celular, toque no arquivo. O Android vai pedir para **permitir instalar apps desta fonte** → permita só para esse app → **Instalar**.

---

## Problemas comuns

| Problema | Solução |
|---|---|
| "Instalar app" não aparece no menu do Chrome | Confira se o endereço começa com `https://`. Recarregue a página e espere uns segundos. |
| Abri no PC e meus dados sumiram | Você pode ter aberto em outro navegador ou em janela anônima. Use sempre o mesmo navegador. |
| Quero começar do zero | Ajustes → **Apagar tudo e recomeçar**. |
| Alguma tarefa "não coube" | Adicione horários livres, diminua as vezes por semana, ou aumente o "Máximo de tarefas da casa por dia" em Ajustes. |
