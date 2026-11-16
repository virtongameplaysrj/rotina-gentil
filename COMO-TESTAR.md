# Rotina Gentil — como testar e instalar (guia para iniciantes)

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app. É este que você abre. |
| `app.js` | As telas e os botões. |
| `scheduler.js` | O "cérebro" que monta a agenda e calcula as barras de necessidades. |
| `data.js` | Listas de sugestões (tarefas, áreas de lazer, frases). Dá para editar no Bloco de Notas. |
| `styles.css` | Cores, tamanhos e aparência. |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Fazem o app poder ser instalado no celular e funcionar sem internet. |
| `tests.html` | Testes automáticos do cérebro da agenda. Abra para ver se está tudo ✔. |
| `android/`, `package.json`, `capacitor.config.json`, `scripts/` | Transformam o app em um APK de Android (veja a Parte 4). |
| `.github/workflows/android.yml` | A "fábrica" do GitHub que monta o APK e publica a Release sozinha. |

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

## Parte 4 — Instalar pelo Obtainium (APK com atualização automática)

O GitHub monta o APK sozinho toda vez que a branch `main` muda e publica em
**Releases**: https://github.com/virtongameplaysrj/rotina-gentil/releases
O Obtainium olha essa página e instala/atualiza o app.

### Passo A — Cadastrar a chave de assinatura (uma vez só)

Todo APK precisa ser assinado sempre com a **mesma chave**, senão o Android não aceita a atualização.

1. No GitHub, abra o repositório → **Settings** → **Secrets and variables** → **Actions**.
2. Clique em **New repository secret** e crie estes 4 (nome exatamente igual, valores do arquivo `SEGREDOS-DO-APK.txt`):
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
3. Guarde o `SEGREDOS-DO-APK.txt` e o `rotina-gentil.keystore` num lugar seguro (ex.: Google Drive).
   **Nunca** coloque esses arquivos dentro do repositório.

### Passo B — Gerar a primeira versão

1. Depois de cadastrar os secrets, vá em **Actions** → **APK Android** → **Run workflow** → **Run workflow**
   (ou faça qualquer mudança na `main`).
2. Espere uns 5–10 minutos até aparecer o ✅ verde.
3. Em **Releases** vai aparecer `Rotina Gentil 1.0.N` com o arquivo `rotina-gentil-v1.0.N.apk`.

### Passo C — Adicionar no Obtainium (no celular)

1. Abra o **Obtainium** → toque em **Adicionar app** (➕).
2. Em **URL de origem do app**, cole: `https://github.com/virtongameplaysrj/rotina-gentil`
3. Toque em **Adicionar** e depois em **Instalar**. Se o Android pedir, permita "instalar apps desta fonte" para o Obtainium.
4. Pronto! Quando sair uma versão nova, o Obtainium avisa e atualiza. Seus dados continuam no celular.

> Na primeira vez que ligar os **lembretes**, o Android vai pedir permissão de notificações: toque em **Permitir**.
> Os lembretes tocam 10 min antes e na hora de cada atividade, **mesmo com o app fechado**.
> Em alguns celulares (Xiaomi, Samsung…) vale liberar o app em **Bateria → Sem restrições** para os avisos não atrasarem.
>
> **Os dados do APK são separados** dos dados do app pelo Chrome. Para levar seus dados:
> no app antigo **Ajustes → Salvar cópia**, e no APK **Ajustes → Restaurar cópia**.

### Para quem for mexer no código

- Os arquivos do app continuam na raiz (`app.js`, `styles.css`…). O comando `npm run sync` copia tudo para `www/` e para o projeto Android.
- Para testar no Android Studio: `npm install`, `npm run sync` e abrir a pasta `android/`.

---

## Problemas comuns

| Problema | Solução |
|---|---|
| "Instalar app" não aparece no menu do Chrome | Confira se o endereço começa com `https://`. Recarregue a página e espere uns segundos. |
| Abri no PC e meus dados sumiram | Você pode ter aberto em outro navegador ou em janela anônima. Use sempre o mesmo navegador. |
| Quero começar do zero | Ajustes → **Apagar tudo e recomeçar**. |
| O Obtainium diz que não achou APK | Confira em **Releases** se já existe uma versão. Se o workflow em **Actions** ficou vermelho, veja se os 4 secrets foram criados com o nome certo. |
| O Android não deixa atualizar ("conflito de pacote") | O APK foi assinado com outra chave. Confira se o secret `ANDROID_KEYSTORE_BASE64` é o mesmo de antes. |
| Alguma tarefa "não coube" | Adicione horários livres, diminua as vezes por semana, ou aumente o "Máximo de tarefas da casa por dia" em Ajustes. |
