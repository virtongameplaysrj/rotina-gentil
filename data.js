/* Catálogos: necessidades, sugestões de tarefas da casa, atividade física e áreas de lazer. */
window.CATALOG = {
  needs: {
    alimentacao: { label: 'Alimentação', icon: '🍲', hint: 'Comida pronta e geladeira abastecida.' },
    ambiente:    { label: 'Ambiente',    icon: '🏠', hint: 'Casa limpa e organizada: louça, lixo, chão.' },
    higiene:     { label: 'Higiene',     icon: '🫧', hint: 'Banheiro, roupa de cama e cuidados com o corpo.' },
    roupas:      { label: 'Roupas',      icon: '👕', hint: 'Roupa limpa e guardada.' },
    corpo:       { label: 'Corpo',       icon: '🏃', hint: 'Atividade física: mexer o corpo do seu jeito.' },
    diversao:    { label: 'Diversão',    icon: '🎈', hint: 'Coisas que você faz só porque gosta.' },
    social:      { label: 'Social',      icon: '💬', hint: 'Contato com pessoas, no seu ritmo.' },
    energia:     { label: 'Energia',     icon: '🔋', hint: 'Descanso, natureza e recarregar as baterias.' }
  },
  choreNeeds: ['ambiente', 'higiene', 'alimentacao', 'roupas'],
  leisureNeeds: ['diversao', 'social', 'energia'],

  // [nome, necessidade, minutos, vezes, unidade ('week' | 'month'), importância 1-3]
  chores: [
    ['Lavar a louça', 'ambiente', 20, 5, 'week', 3],
    ['Cozinhar / preparar refeições', 'alimentacao', 40, 3, 'week', 3],
    ['Fazer compras (mercado)', 'alimentacao', 60, 1, 'week', 3],
    ['Lavar roupa', 'roupas', 20, 2, 'week', 3],
    ['Estender e dobrar roupa', 'roupas', 20, 2, 'week', 2],
    ['Tirar o lixo', 'ambiente', 10, 2, 'week', 2],
    ['Varrer ou aspirar', 'ambiente', 25, 2, 'week', 2],
    ['Limpar o banheiro', 'higiene', 30, 1, 'week', 2],
    ['Trocar roupa de cama', 'higiene', 20, 2, 'month', 2],
    ['Organizar o quarto', 'ambiente', 20, 1, 'week', 1],
    ['Regar as plantas', 'ambiente', 5, 2, 'week', 1],
    ['Limpar a geladeira', 'alimentacao', 25, 1, 'month', 2],
    ['Pagar contas / organizar papéis', 'ambiente', 20, 1, 'month', 3],
    ['Limpar janelas e vidros', 'ambiente', 30, 1, 'month', 1],
    ['Lavar tapetes e cortinas', 'ambiente', 40, 1, 'month', 1],
    ['Limpar o fogão e o forno', 'alimentacao', 30, 1, 'month', 2],
    ['Trocar toalhas', 'higiene', 10, 3, 'month', 2]
  ],

  // Atividade física (etapa opcional)
  exercise: [
    ['Caminhada', 30, 3, 'week'],
    ['Academia / musculação', 60, 3, 'week'],
    ['Corrida', 30, 2, 'week'],
    ['Alongamento ou yoga', 20, 3, 'week'],
    ['Treino em casa', 25, 2, 'week'],
    ['Bicicleta', 45, 2, 'week'],
    ['Natação', 45, 2, 'week'],
    ['Dança', 30, 1, 'week'],
    ['Esporte coletivo (futebol, vôlei…)', 90, 1, 'week'],
    ['Trilha / caminhada longa', 180, 1, 'month']
  ],

  // Áreas de lazer. Ideias: [nome, minutos, dica para a lista "quais?"]
  leisureAreas: {
    jogos: { label: 'Jogos', icon: '🎮', need: 'diversao', desc: 'Videogame, celular, tabuleiro, cartas. Cadastre os jogos que você curte e o app escolhe por você.',
      ideas: [['Videogame (console ou PC)', 60, 'Ex.: Stardew Valley, Minecraft'], ['Jogo de celular', 30, 'Ex.: palavras cruzadas, sudoku'],
        ['Jogo de tabuleiro ou cartas', 45, 'Ex.: Uno, xadrez'], ['Jogo online com amigos', 60, 'Ex.: o jogo do grupo'],
        ['Jogo de lógica / quebra-cabeça', 30, 'Ex.: quebra-cabeça de 500 peças']] },
    telas: { label: 'Séries e filmes', icon: '🎬', need: 'diversao', desc: 'O que você está assistindo agora. O app escolhe a vez de cada um.',
      ideas: [['Assistir série ou anime', 45, 'Ex.: nome das séries'], ['Assistir um filme', 120, 'Ex.: filmes da sua lista'], ['Vídeos do meu canal favorito', 30, 'Ex.: nome dos canais']] },
    interesse: { label: 'Interesse especial', icon: '🌟', need: 'diversao', desc: 'Seu hiperfoco ou assunto favorito. Tempo para ele sem culpa.',
      ideas: [['Tempo no meu interesse especial', 60, 'Ex.: aviões, dinossauros'], ['Ler um livro', 30, 'Ex.: livros que está lendo'], ['Ver um documentário', 50, 'Ex.: temas']] },
    criativo: { label: 'Criatividade', icon: '🎨', need: 'diversao', desc: 'Criar com as mãos, sons ou palavras.',
      ideas: [['Desenhar ou pintar', 30, ''], ['Tocar um instrumento', 30, 'Ex.: violão'], ['Escrever', 20, ''], ['Artesanato', 40, 'Ex.: crochê']] },
    social: { label: 'Social', icon: '💬', need: 'social', desc: 'Contato com pessoas — pode ser por mensagem, no seu ritmo.',
      ideas: [['Mandar mensagem ou áudio para alguém', 15, 'Ex.: nomes das pessoas'], ['Encontrar um amigo', 90, 'Ex.: nomes'], ['Ligar para a família', 20, 'Ex.: mãe, irmão']] },
    descanso: { label: 'Descanso', icon: '🛋️', need: 'energia', desc: 'Recarregar: silêncio, conforto, calma.',
      ideas: [['Banho relaxante', 20, ''], ['Ouvir um álbum inteiro', 40, 'Ex.: álbuns favoritos'], ['Respiração ou meditação', 10, ''], ['Cochilo', 20, '']] },
    natureza: { label: 'Natureza', icon: '🌳', need: 'energia', desc: 'Ar livre, sol, plantas e bichos.',
      ideas: [['Ir a um parque', 60, 'Ex.: nomes dos parques'], ['Tomar sol', 15, ''], ['Brincar com o pet', 20, '']] }
  },

  weekdays: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],

  kindWords: [
    'Feito! Você começou, e começar é a parte mais difícil.',
    'Pronto! Um passo de cada vez.',
    'Concluído. Pode respirar um pouco agora.',
    'Feito! Sua casa (e você) agradecem.',
    'Boa! Isso conta, e conta muito.'
  ]
};
