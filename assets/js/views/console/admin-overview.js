import { html } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { consoleShell, statTile, panel, fill } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { auditRows } from './admin-audit.js';
import { emptyState } from '../../ui/components.js';

export default async function adminOverview({ access, path }) {
  return {
    title: 'Admin',
    html: consoleShell({
      access, path,
      eyebrow: 'ADMIN CONTROL CENTER',
      title: 'Overview',
      lead: 'Platform health at a glance. Numbers come from the backend; “—” means that metric isn’t available yet.',
      body: html`
        <div id="adStats" class="stat-grid stat-grid-wide"></div>
        <div class="console-cols">
          ${panel('Waiting for review', html`<div id="adQueue"></div>`, { action: html`<a class="see-all" href="#/admin/reviews">Review activity</a>` })}
          ${panel('Recent activity', html`<div id="adAudit"></div>`, { action: html`<a class="see-all" href="#/admin/audit">Audit log</a>` })}
        </div>`,
    }),
    bind(root) {
      fill(root.querySelector('#adStats'), {
        load: () => api.admin.getStats(), what: 'Platform statistics',
        render: s => html`
          ${statTile({ label: 'Students', value: s.total_students, icon: 'users', href: '#/admin/students' })}
          ${statTile({ label: 'Section editors', value: s.section_editors, icon: 'upload', href: '#/admin/team?role=section_editor' })}
          ${statTile({ label: 'Content managers', value: s.content_managers, icon: 'shield', href: '#/admin/team?role=content_manager' })}
          ${statTile({ label: 'Pending reviews', value: s.pending_reviews, icon: 'inbox', href: '#/admin/reviews' })}
          ${statTile({ label: 'Published resources', value: s.published_resources, icon: 'book', href: '#/admin/content?status=published' })}
          ${statTile({ label: 'Quizzes', value: s.quizzes, icon: 'quiz', hint: 'Module not built yet', href: '#/admin/quizzes' })}
          ${statTile({ label: 'Activities', value: s.activities, icon: 'flag', hint: 'Module not built yet', href: '#/admin/activities' })}`,
      });
      fill(root.querySelector('#adQueue'), {
        load: () => api.review.listQueue({ status: 'pending_review', limit: 5 }), what: 'The review queue',
        render: page => page.items.length
          ? contentRows(page.items, { hrefFor: it => `#/admin/content/${encodeURIComponent(it.id)}`, show: ['submitter'] })
          : emptyState('All caught up', 'No submissions are waiting.'),
      });
      fill(root.querySelector('#adAudit'), {
        load: () => api.admin.listAuditLog({ limit: 6 }), what: 'The audit log',
        render: page => page.items.length ? auditRows(page.items, { compact: true }) : emptyState('No activity yet'),
      });
    },
  };
}
