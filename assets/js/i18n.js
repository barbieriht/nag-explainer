/*
 * Strings that the demos generate at runtime, in English and Portuguese. The
 * language is the page's <html lang>; static prose lives in index.html and
 * index.pt.html. t('key', { name: value }) fills {name} placeholders.
 */
(function (root) {
  'use strict';

  const STRINGS = {
    en: {
      'common.accuracy': 'Accuracy (%)',
      'common.probability': 'Probability',
      'common.cell': 'Cell',
      'common.degenerate': 'degenerate: no path from input to output',

      'space.readout': 'This cell reaches {acc}% on the {task} task, better than {pct}% of all cells.',
      'space.readoutBad': 'This cell is degenerate (no path from input to output), so it scores {acc}%, chance level.',
      'space.histAria': 'Histogram of the accuracy of all cells on the selected task',
      'space.cells': 'Number of cells',
      'task.easy': 'easy',
      'task.medium': 'medium',
      'task.hard': 'hard',

      'beta.aria': 'Probability mass of the target distribution by accuracy bin',
      'beta.mass': 'Probability mass',
      'beta.best': 'A*',
      'beta.argmax': 'The best cell, A*: {acc}%.',
      'beta.sample': 'A sample from p*: {acc}%.',

      'am.progressAria': 'Best accuracy found versus number of evaluations',
      'am.costAria': 'Cumulative evaluations versus number of tasks solved',
      'am.evaluations': 'Evaluations on this task',
      'am.tasks': 'Number of new tasks',
      'am.cumulative': 'Total evaluations',
      'am.training': 'Training the generator on {n} tasks… epoch {epoch} of {total}',
      'am.ready': 'Generator trained ({evals} evaluations spent once). Pick a new task and compare.',
      'am.nasRunning': 'NAS: evaluation {i} of {n}…',
      'am.nasDone': 'NAS found {acc}% after {n} evaluations. The best cell for this task reaches {opt}%.',
      'am.nagDone': 'The generator\'s best of {n} samples reaches {acc}% (mean {mean}%), with no search. The best cell reaches {opt}%.',
      'am.taskChanged': 'New task: difficulty {d1}, resolution {d2}. Run both methods.',
      'am.nasCaption': 'Best cell found by NAS: {acc}%.',
      'am.nagCaption': 'Best of the generator\'s {n} samples: {acc}%.',

      'latent.low': '← predicted lower accuracy',
      'latent.high': 'predicted higher accuracy →',
      'latent.caption': 'Decoded cell: {acc}% (predictor says {pred}%).',
      'latent.start': 'Starting point decodes to a cell with {acc}%. Press "Climb the predictor".',
      'latent.climbing': 'Climbing… step {i}',
      'latent.done': 'The predictor promised {pred}%; the decoded cell really reaches {acc}%. The best cell in the space reaches {opt}%. Along the way the path decoded to {distinct} distinct cells.',

      'diff.step': 'Step {t} of {T}: {state}',
      'diff.noise': 'noise',
      'diff.clean': 'final cell, {acc}%',
      'diff.aria': 'Histogram of the accuracy of generated cells',
      'diff.count': 'Cells',
      'diff.archiveBest': 'archive best',
      'diff.optimum': 'best cell',
      'diff.accValue': '{mean}% / {best}%',

      'flow.aria': 'Probability of the 40 most accurate cells under the target, the GFlowNet and reinforcement learning',
      'flow.rank': 'Cells ranked by accuracy (1 = best)',
      'flow.training': 'Training… {i} of {n} episodes',
      'flow.done': 'Done. Both policies saw {n} episodes.',
      'flow.paused': 'Paused at {i} of {n} episodes.',
      'flow.pause': 'Pause',
      'flow.train': 'Train both',
      'flow.resume': 'Resume',
      'flow.idle': 'Press "Train both". Training runs 200,000 construction episodes per policy.',

      'pareto.params': 'Parameters (millions)',
      'pareto.training': 'Training the budget-conditioned generator…',
      'pareto.readout': '{within} of 50 samples fit the budget. Best sample within budget: {acc}%. Best possible within budget: {best}%.',
      'pareto.none': 'None of the 50 samples fits this budget. The generator is weakest at the smallest budgets.',
    },
    pt: {
      'common.accuracy': 'Acurácia (%)',
      'common.probability': 'Probabilidade',
      'common.cell': 'Célula',
      'common.degenerate': 'degenerada: nenhum caminho da entrada à saída',

      'space.readout': 'Esta célula atinge {acc}% na tarefa {task}, melhor que {pct}% de todas as células.',
      'space.readoutBad': 'Esta célula é degenerada (nenhum caminho da entrada à saída), então fica em {acc}%, o nível do acaso.',
      'space.histAria': 'Histograma da acurácia de todas as células na tarefa escolhida',
      'space.cells': 'Número de células',
      'task.easy': 'fácil',
      'task.medium': 'média',
      'task.hard': 'difícil',

      'beta.aria': 'Massa de probabilidade da distribuição-alvo por faixa de acurácia',
      'beta.mass': 'Massa de probabilidade',
      'beta.best': 'A*',
      'beta.argmax': 'A melhor célula, A*: {acc}%.',
      'beta.sample': 'Uma amostra de p*: {acc}%.',

      'am.progressAria': 'Melhor acurácia encontrada versus número de avaliações',
      'am.costAria': 'Avaliações acumuladas versus número de tarefas resolvidas',
      'am.evaluations': 'Avaliações nesta tarefa',
      'am.tasks': 'Número de tarefas novas',
      'am.cumulative': 'Total de avaliações',
      'am.training': 'Treinando o gerador em {n} tarefas… época {epoch} de {total}',
      'am.ready': 'Gerador treinado ({evals} avaliações gastas uma única vez). Escolha uma tarefa nova e compare.',
      'am.nasRunning': 'NAS: avaliação {i} de {n}…',
      'am.nasDone': 'O NAS encontrou {acc}% após {n} avaliações. A melhor célula desta tarefa atinge {opt}%.',
      'am.nagDone': 'A melhor de {n} amostras do gerador atinge {acc}% (média {mean}%), sem busca. A melhor célula atinge {opt}%.',
      'am.taskChanged': 'Tarefa nova: dificuldade {d1}, resolução {d2}. Rode os dois métodos.',
      'am.nasCaption': 'Melhor célula encontrada pelo NAS: {acc}%.',
      'am.nagCaption': 'Melhor das {n} amostras do gerador: {acc}%.',

      'latent.low': '← acurácia prevista menor',
      'latent.high': 'acurácia prevista maior →',
      'latent.caption': 'Célula decodificada: {acc}% (o preditor diz {pred}%).',
      'latent.start': 'O ponto inicial decodifica para uma célula com {acc}%. Clique em "Subir o preditor".',
      'latent.climbing': 'Subindo… passo {i}',
      'latent.done': 'O preditor prometia {pred}%; a célula decodificada atinge de fato {acc}%. A melhor célula do espaço atinge {opt}%. No caminho, o ponto decodificou para {distinct} células distintas.',

      'diff.step': 'Passo {t} de {T}: {state}',
      'diff.noise': 'ruído',
      'diff.clean': 'célula final, {acc}%',
      'diff.aria': 'Histograma da acurácia das células geradas',
      'diff.count': 'Células',
      'diff.archiveBest': 'melhor do arquivo',
      'diff.optimum': 'melhor célula',
      'diff.accValue': '{mean}% / {best}%',

      'flow.aria': 'Probabilidade das 40 células mais precisas sob o alvo, a GFlowNet e o aprendizado por reforço',
      'flow.rank': 'Células ordenadas por acurácia (1 = melhor)',
      'flow.training': 'Treinando… {i} de {n} episódios',
      'flow.done': 'Pronto. Cada política viu {n} episódios.',
      'flow.paused': 'Pausado em {i} de {n} episódios.',
      'flow.pause': 'Pausar',
      'flow.train': 'Treinar as duas',
      'flow.resume': 'Continuar',
      'flow.idle': 'Clique em "Treinar as duas". O treino roda 200.000 episódios de construção por política.',

      'pareto.params': 'Parâmetros (milhões)',
      'pareto.training': 'Treinando o gerador condicionado ao orçamento…',
      'pareto.readout': '{within} de 50 amostras cabem no orçamento. Melhor amostra dentro do orçamento: {acc}%. Melhor possível dentro do orçamento: {best}%.',
      'pareto.none': 'Nenhuma das 50 amostras cabe neste orçamento. O gerador é mais fraco nos menores orçamentos.',
    },
  };

  const lang = /^pt/i.test(document.documentElement.lang) ? 'pt' : 'en';
  const locale = lang === 'pt' ? 'pt-BR' : 'en-US';

  function t(key, vars) {
    const template = STRINGS[lang][key] !== undefined ? STRINGS[lang][key] : STRINGS.en[key];
    if (template === undefined) throw new Error('missing string: ' + key);
    return template.replace(/\{(\w+)\}/g, function (all, name) {
      return vars && vars[name] !== undefined ? String(vars[name]) : all;
    });
  }

  // Locale-aware fixed-digit number (decimal comma in Portuguese).
  function num(value, digits) {
    return Number(value).toLocaleString(locale, { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }

  // Keep the reader's place when switching language: carry the #section over.
  document.querySelectorAll('[data-lang-switch] a').forEach(function (link) {
    link.addEventListener('click', function () {
      link.setAttribute('href', link.getAttribute('href').split('#')[0] + window.location.hash);
    });
  });

  root.NAG = root.NAG || {};
  root.NAG.i18n = { lang: lang, t: t, num: num, STRINGS: STRINGS };
})(globalThis);
