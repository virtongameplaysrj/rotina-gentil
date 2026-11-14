/* Catálogos: necessidades, sugestões de tarefas domésticas e áreas de lazer. */
window.CATALOG = {
  needs: {
    higiene:     { label: 'Higiene',     icon: '🫧', hint: 'Banheiro, roupa de cama e cuidados com o corpo.' },
    ambiente:    { label: 'Casa',        icon: '🏠', hint: 'Casa limpa e organizada: louça, lixo, chão.' },
    alimentacao: { label: 'Alimentação', icon: '🍲', hint: 'Comida pronta e geladeira abastecida.' },
    roupas:      { label: 'Roupas',      icon: '👕', hint: 'Roupa limpa e guardada.' },
    diversao:    { label: 'Diversão',    icon: '🎈', hint: 'Coisas que você faz só porque gosta.' },
    social:      { label: 'Social',      icon: '💬', hint: 'Contato com pessoas, no seu ritmo.' },
    energia:     { label: 'Energia',     icon: '🔋', hint: 'Descanso, corpo e recarregar as baterias.' }
  },
  choreNeeds: ['ambiente', 'higiene', 'alimentacao', 'roupas'],
  leisureNeeds: ['diversao', 'social', 'energia'],

  chores: [
    { name: 'Lavar a louça', need: 'ambiente', duration: 20, perWeek: 5, importance: 3, firstStep: 'Coloque uma música e abra a torneira.' },
    { name: 'Cozinhar / preparar refeições', need: 'alimentacao', duration: 40, perWeek: 3, importance: 3, firstStep: 'Coloque uma panela em cima do fogão.' },
    { name: 'Fazer compras (mercado)', need: 'alimentacao', duration: 60, perWeek: 1, importance: 3, firstStep: 'Abra a geladeira e anote 3 coisas que faltam.' },
    { name: 'Lavar roupa', need: 'roupas', duration: 20, perWeek: 2, importance: 3, firstStep: 'Leve só o cesto de roupa até a máquina.' },
    { name: 'Estender e dobrar roupa', need: 'roupas', duration: 20, perWeek: 2, importance: 2, firstStep: 'Pegue só 5 peças.' },
    { name: 'Tirar o lixo', need: 'ambiente', duration: 10, perWeek: 2, importance: 2, firstStep: 'Pegue um saco de lixo novo.' },
    { name: 'Varrer ou aspirar', need: 'ambiente', duration: 25, perWeek: 2, importance: 2, firstStep: 'Pegue a vassoura e comece pelo cômodo onde você está.' },
    { name: 'Limpar o banheiro', need: 'higiene', duration: 30, perWeek: 1, importance: 2, firstStep: 'Borrife o produto na pia e espere 2 minutos.' },
    { name: 'Trocar roupa de cama', need: 'higiene', duration: 20, perWeek: 1, importance: 1, firstStep: 'Tire só a fronha do travesseiro.' },
    { name: 'Organizar o quarto', need: 'ambiente', duration: 20, perWeek: 1, importance: 1, firstStep: 'Guarde 5 objetos que estão fora do lugar.' },
    { name: 'Limpar a geladeira', need: 'alimentacao', duration: 20, perWeek: 1, importance: 1, firstStep: 'Jogue fora 1 coisa vencida.' },
    { name: 'Organizar papéis e contas', need: 'ambiente', duration: 20, perWeek: 1, importance: 2, firstStep: 'Junte os papéis em uma pilha só.' },
    { name: 'Regar as plantas', need: 'ambiente', duration: 5, perWeek: 2, importance: 1, firstStep: 'Encha o regador.' }
  ],

  leisureAreas: {
    interesse: { label: 'Interesse especial', icon: '🌟', need: 'diversao', desc: 'Seu hiperfoco ou assunto favorito. Tempo para ele sem culpa.',
      ideas: [['Tempo livre no meu interesse especial', 60, 'Abra o material do seu interesse.'], ['Ler um livro', 30, 'Pegue o livro e leia 1 página.'], ['Ver um documentário', 50, 'Escolha o documentário agora e deixe pronto.']] },
    criativo: { label: 'Criatividade', icon: '🎨', need: 'diversao', desc: 'Criar com as mãos, sons ou palavras.',
      ideas: [['Desenhar ou pintar', 30, 'Separe um papel e um lápis.'], ['Tocar um instrumento', 30, 'Pegue o instrumento e afine.'], ['Escrever', 20, 'Escreva uma frase qualquer.'], ['Artesanato', 40, 'Separe o material na mesa.']] },
    jogos: { label: 'Jogos e telas', icon: '🎮', need: 'diversao', desc: 'Videogame, séries, filmes, jogos de tabuleiro.',
      ideas: [['Jogar videogame', 60, 'Ligue o console ou abra o jogo.'], ['Assistir um episódio', 45, 'Escolha o episódio e sente no sofá.'], ['Quebra-cabeça ou jogo de tabuleiro', 45, 'Abra a caixa.']] },
    social: { label: 'Social', icon: '💬', need: 'social', desc: 'Contato com pessoas — pode ser por mensagem, no seu ritmo.',
      ideas: [['Mandar mensagem ou áudio para alguém', 15, 'Abra a conversa com a pessoa.'], ['Encontrar um amigo', 90, 'Mande: “bora se ver essa semana?”'], ['Jogar online com amigos', 60, 'Avise no grupo que vai entrar.']] },
    movimento: { label: 'Movimento', icon: '🚶', need: 'energia', desc: 'Mexer o corpo de um jeito gostoso.',
      ideas: [['Caminhada', 30, 'Calce o tênis.'], ['Dançar algumas músicas', 10, 'Coloque sua música favorita.'], ['Alongamento', 15, 'Estique os braços para cima.'], ['Andar de bicicleta', 40, 'Encha o pneu da bicicleta.']] },
    descanso: { label: 'Descanso', icon: '🛋️', need: 'energia', desc: 'Recarregar: silêncio, conforto, calma.',
      ideas: [['Banho relaxante', 20, 'Separe a toalha.'], ['Ouvir um álbum inteiro', 40, 'Coloque os fones.'], ['Respiração ou meditação', 10, 'Sente e feche os olhos.'], ['Cochilo', 20, 'Coloque um alarme de 20 minutos.']] },
    natureza: { label: 'Natureza', icon: '🌳', need: 'energia', desc: 'Ar livre, sol, plantas e bichos.',
      ideas: [['Ir a um parque', 60, 'Coloque uma garrafa de água na bolsa.'], ['Tomar sol', 15, 'Abra a janela ou vá até a porta.'], ['Brincar com o pet', 20, 'Pegue o brinquedo dele.']] }
  },

  weekdays: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],
  weekdaysShort: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],

  kindWords: [
    'Feito! Você começou, e começar é a parte mais difícil.',
    'Pronto! Um passo de cada vez.',
    'Concluído. Pode respirar um pouco agora.',
    'Feito! Sua casa (e você) agradecem.',
    'Boa! Isso conta, e conta muito.'
  ]
};
