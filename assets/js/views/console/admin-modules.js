// Admin sections for modules that don't have a backend yet. They describe
// what's planned and make no backend calls — nothing here is fake data.

import { consoleShell, futureModule } from '../../ui/console.js';

const MODULES = {
  activities: {
    title: 'Activities',
    icon: 'flag',
    text: 'Create and manage student activities — events, competitions, club sessions and workshops — and track participation.',
    points: ['Create, schedule and publish activities', 'Target by university, group or section', 'Attendance / participation and XP rewards'],
  },
  quizzes: {
    title: 'Quizzes',
    icon: 'quiz',
    text: 'Build quizzes per subject and week, review results, and award XP.',
    points: ['Question bank per subject', 'Schedule quizzes for groups and sections', 'Results, attempts and XP'],
  },
  leaderboards: {
    title: 'Leaderboards',
    icon: 'trophy',
    text: 'XP, levels and badges ranked across the university, each group and each section.',
    points: ['University / group / section rankings', 'Seasons and resets', 'Badge and level rules'],
  },
};

function makeView(id) {
  const m = MODULES[id];
  return async function adminModule({ access, path }) {
    return {
      title: m.title,
      html: consoleShell({ access, path, eyebrow: 'ADMIN CONTROL CENTER', title: m.title, body: futureModule(m) }),
    };
  };
}

export const adminActivities = makeView('activities');
export const adminQuizzes = makeView('quizzes');
export const adminLeaderboards = makeView('leaderboards');
