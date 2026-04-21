const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');

const nlp = winkNLP(model);
const its = nlp.its;

const doc = nlp.readDoc("Please contact me at test@example.com by January 15th, 2024 to discuss the $500 invoice.");
const entities = doc.entities().out(its.detail);
const entitiesOut = doc.entities().out();
console.log("Details:", entities);
console.log("Values:", entitiesOut);
