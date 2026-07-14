'use strict';
// Fila FIFO com 1 job em voo. O runner nunca rejeita em operacao normal,
// mas um job que rejeitar nao trava a fila.

function createQueue() {
  let tail = Promise.resolve();
  return {
    enqueue(job) {
      const next = tail.then(job, job);
      tail = next.catch(() => {});
      return next;
    },
  };
}

module.exports = {createQueue};
