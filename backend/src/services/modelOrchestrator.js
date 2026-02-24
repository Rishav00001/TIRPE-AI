const { getTrainingDataset } = require('../repositories/footfallRepository');
const { trainModel } = require('./aiService');

const orchestratorState = {
  lastTrainedAt: null,
  lastTrainingSize: 0,
  trainingStatus: 'idle',
};

async function trainModelFromDatabase() {
  orchestratorState.trainingStatus = 'running';

  const rows = await getTrainingDataset();
  if (!rows.length) {
    orchestratorState.trainingStatus = 'skipped';
    return {
      trained: false,
      reason: 'No data available for training',
    };
  }

  const response = await trainModel(rows);

  orchestratorState.lastTrainedAt = new Date().toISOString();
  orchestratorState.lastTrainingSize = rows.length;
  orchestratorState.trainingStatus = response?.status === 'skipped' ? 'external-provider' : 'ready';

  return {
    trained: response?.status !== 'skipped',
    samples: rows.length,
    model: response,
  };
}

function scheduleRetraining(intervalMs = 60 * 60 * 1000) {
  setInterval(async () => {
    try {
      await trainModelFromDatabase();
      console.info('AI model retraining completed');
    } catch (error) {
      orchestratorState.trainingStatus = 'error';
      console.error('AI retraining failed', error.message);
    }
  }, intervalMs);
}

function getModelStatus() {
  return { ...orchestratorState };
}

module.exports = {
  trainModelFromDatabase,
  scheduleRetraining,
  getModelStatus,
};
