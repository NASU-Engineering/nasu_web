// Student pages for modules whose backend doesn't exist yet. No API calls, no sample data.

import { html } from '../ui/html.js';
import { pageHead } from '../ui/components.js';
import { futureModule } from '../ui/console.js';

const PAGES = {
  quizzes: {
    title: 'Quizzes', heading: 'Quizzes are on the way', icon: 'quiz',
    text: 'Short quizzes for each subject and week, so you can check what you’ve understood before exams.',
    points: ['Weekly practice quizzes per subject', 'Instant results', 'Earn XP for every quiz you finish'],
  },
  activities: {
    title: 'Activities', heading: 'Activities are on the way', icon: 'flag',
    text: 'Events, competitions, clubs, workshops and opportunities for prep-year students.',
    points: ['Sign up for events and workshops', 'Join clubs and competitions', 'Earn XP and badges for taking part'],
  },
  leaderboard: {
    title: 'Leaderboard', heading: 'The leaderboard is on the way', icon: 'trophy',
    text: 'See how you, your section and your group rank across the prep year.',
    points: ['University, group and section rankings', 'Levels and badges', 'Weekly highlights'],
  },
};

function makeView(id) {
  const p = PAGES[id];
  return async function comingSoon() {
    return {
      title: p.title,
      html: html`
        ${pageHead({ eyebrow: 'COMING SOON', title: p.title })}
        ${futureModule({ ...p, title: p.heading })}`,
    };
  };
}

export const quizzes = makeView('quizzes');
export const activities = makeView('activities');
export const leaderboard = makeView('leaderboard');
