const { predictFootfall } = require('../services/aiService');

async function predict(req, res) {
  const payload = req.body;

  const prediction = await predictFootfall(payload);
  return res.json({
    data: prediction,
  });
}

module.exports = {
  predict,
};
