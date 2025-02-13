import { uniqueNamesGenerator, Config, adjectives, animals } from 'unique-names-generator';

const customConfig: Config = {
  dictionaries: [adjectives, animals],
  separator: '-',
  length: 2,
  style: 'lowerCase'
};

export const generatePeerId = (): string => {
  return uniqueNamesGenerator(customConfig);
};