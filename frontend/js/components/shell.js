/**
 * ============================================================================
 * SYLLORA APPSHELL COMPONENT
 * ============================================================================
 * Persistent desktop sidebar (260-280px wide, white surface), enlarged brand logo (68px),
 * workspace switcher context, topbar with breadcrumb & global search,
 * responsive mobile drawer, notification popover, and profile integration.
 *
 * Designed to mount ONCE and update routes, badges, and user state in place
 * without destroying the active view or losing focused input.
 */

import { router } from '../router.js';
import { sessionAdapter } from '../session.js';
import { workspaceStore } from '../state.js';
import { Toast, Modal } from './modal.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class AppShell {
  constructor(containerId = 'workspaceContainer') {
    this.container = document.getElementById(containerId);
    this.isMounted = false;
    this.isDrawerOpen = false;
    this.isNotificationOpen = false;
    this.isUserMenuOpen = false;
    this.isCourseMenuOpen = false;
    this.currentPath = '/app/overview';

    this.navItems = [
      { path: '/app/overview', label: 'Overview', icon: 'grid' },
      { path: '/app/materials', label: 'Study materials', icon: 'book', badgeKey: 'totalDocs' },
      { path: '/app/ask', label: 'Ask Syllora', icon: 'sparkle' },
      { path: '/app/syllabus', label: 'Syllabus map', icon: 'map' },
      { path: '/app/understanding', label: 'Check understanding', icon: 'check-circle' },
      { path: '/app/misconceptions', label: 'Misconception notebook', icon: 'notebook', badgeKey: 'openMisconceptionsCount', badgeStyle: 'coral' },
      { path: '/app/revision', label: 'Revision planner', icon: 'calendar', badgeKey: 'pendingTasksCount' },
      { path: '/app/settings', label: 'Settings', icon: 'gear' }
    ];
  }

  getIconSvg(name) {
    switch (name) {
      case 'grid':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
      case 'book':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
      case 'sparkle':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>';
      case 'map':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>';
      case 'check-circle':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      case 'notebook':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
      case 'calendar':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      case 'gear':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
      default:
        return '';
    }
  }

  mount() {
    if (this.isMounted && this.container.querySelector('.workspace-layout')) {
      return;
    }

    const state = workspaceStore.getState();
    const user = sessionAdapter.getUser() || { name: 'Student', email: '', role: 'Student', avatarText: 'ST' };
    const stats = workspaceStore.getStats();

    this.container.innerHTML = `
      <div class="workspace-layout">

        <!-- Mobile Drawer Backdrop -->
        <div class="drawer-backdrop" id="drawerBackdrop" aria-hidden="true"></div>

        <!-- Desktop Sidebar (260-280px wide, White surface) -->
        <aside class="workspace-sidebar" id="workspaceSidebar" aria-label="Main Navigation">
          
          <!-- Logo & Brand Header: Visible Stacked Logo ~68px high in brand area -->
          <div class="sidebar-brand-header">
            <a href="#/app/overview" class="sidebar-brand-link" aria-label="Syllora Overview">
              <svg class="sidebar-logo-svg" viewBox="150 250 960 840" width="78" height="68" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Syllora Logo">
                <defs>
                  <mask id="sidebarCheckMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1300" height="1200">
                    <path d="M 425 492 Q 560 600 626 730 Q 720 520 900 365"
                          fill="none" stroke="#fff" stroke-width="110" stroke-linecap="round"/>
                  </mask>
                </defs>
                <g class="layer-brand">
                  <path fill="#03605E" d="M 615 410 Q 560 300 312 274 Q 300 274 300 286 L 300 664 Q 300 676 312 676 Q 500 680 615 762 Z"/>
                  <path fill="#03605E" d="M 638 410 Q 693 300 941 274 Q 953 274 953 286 L 953 664 Q 953 676 941 676 Q 753 680 638 762 Z"/>
                  <path fill="#FAFAF8" mask="url(#sidebarCheckMask)" d="M 432 494 Q 520 540 615 586 L 637 556 Q 760 455 884 372 Q 897 366 893 381 Q 760 520 682 618 Q 641 676 628 742 Q 610 690 590 660 Q 512 572 434 503 Q 427 497 432 494 Z"/>
                  <g fill="#22272B">
                    <path d="M175.6 952.7H216.9Q217.7 964.5 225.3 971.4Q232.8 978.3 246 978.3Q259.5 978.3 267.2 971.8Q274.9 965.4 274.9 954.9Q274.9 946.4 269.7 940.9Q264.5 935.4 256.6 932.2Q248.8 929.1 235 925.2Q216.3 919.7 204.7 914.4Q193 909 184.6 898.1Q176.2 887.3 176.2 869.1Q176.2 852.1 184.7 839.4Q193.2 826.8 208.6 820Q224 813.3 243.8 813.3Q273.5 813.3 292.1 827.7Q310.7 842.2 312.6 868H270.2Q269.7 858.1 261.9 851.7Q254 845.2 241.1 845.2Q229.8 845.2 223.1 851Q216.3 856.8 216.3 867.8Q216.3 875.5 221.4 880.5Q226.5 885.6 234.1 888.8Q241.6 892 255.4 896.1Q274.1 901.6 285.9 907.1Q297.7 912.6 306.3 923.6Q314.8 934.6 314.8 952.5Q314.8 967.9 306.8 981Q298.8 994.2 283.4 1002.1Q268 1009.9 246.9 1009.9Q226.8 1009.9 210.7 1003Q194.6 996.2 185.3 983.2Q175.9 970.3 175.6 952.7Z"/>
                    <path d="M488.8 855.6 394.5 1080H353.5L386.5 1004.1L325.5 855.6H368.6L408 962.1L447.8 855.6Z"/>
                    <path d="M542.9 804.5V1008H504.4V804.5Z"/>
                    <path d="M614.4 804.5V1008H575.9V804.5Z"/>
                    <path d="M637.7 931.8Q637.7 908.5 648 890.6Q658.4 872.7 676.2 862.9Q694.1 853.2 716.1 853.2Q738.1 853.2 756 862.9Q773.9 872.7 784.2 890.6Q794.5 908.5 794.5 931.8Q794.5 955.2 783.9 973.1Q773.3 991 755.3 1000.7Q737.3 1010.5 715 1010.5Q693 1010.5 675.4 1000.7Q657.8 991 647.8 973.1Q637.7 955.2 637.7 931.8ZM754.9 931.8Q754.9 910.1 743.5 898.4Q732 886.7 715.5 886.7Q699 886.7 687.9 898.4Q676.8 910.1 676.8 931.8Q676.8 953.5 687.6 965.2Q698.5 976.9 715 976.9Q725.5 976.9 734.7 971.8Q743.9 966.8 749.4 956.6Q754.9 946.4 754.9 931.8Z"/>
                    <path d="M903.1 853.5V893.9H892.9Q874.7 893.9 865.5 902.4Q856.3 910.9 856.3 932.1V1008H817.8V855.6H856.3V879.3Q863.7 867.2 875.7 860.3Q887.7 853.5 903.1 853.5Z"/>
                    <path d="M983.6 853.2Q1000.6 853.2 1013.4 860Q1026.2 866.9 1033.9 877.4V855.6H1072.7V1008H1033.9V985.7Q1026.5 996.5 1013.4 1003.5Q1000.3 1010.5 983.3 1010.5Q964 1010.5 948.2 1000.6Q932.4 990.7 923.2 972.7Q914 954.6 914 931.3Q914 908.2 923.2 890.3Q932.4 872.4 948.2 862.8Q964 853.2 983.6 853.2ZM993.5 887Q982.8 887 973.7 892.2Q964.6 897.5 959 907.5Q953.3 917.5 953.3 931.3Q953.3 945 959 955.3Q964.6 965.6 973.8 971.1Q983 976.6 993.5 976.6Q1004.2 976.6 1013.5 971.3Q1022.9 965.9 1028.4 955.9Q1033.9 945.9 1033.9 931.8Q1033.9 917.8 1028.4 907.8Q1022.9 897.7 1013.5 892.4Q1004.2 887 993.5 887Z"/>
                  </g>
                </g>
              </svg>
            </a>
          </div>

          <!-- Workspace Context Switcher (Reference: Folder icon "My workspace" with dropdown chevron) -->
          <div class="sidebar-workspace-context">
            <button type="button" class="workspace-switcher-btn" id="workspaceSwitcherBtn" aria-haspopup="true" aria-expanded="false" title="Current Workspace">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M2 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"/>
              </svg>
              <span class="workspace-title-text">My workspace</span>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 8l4 4 4-4"/>
              </svg>
            </button>
          </div>

          <!-- Primary Navigation List (8 Routes) -->
          <nav class="sidebar-nav" aria-label="Main Application Navigation">
            <ul class="nav-list" id="sidebarNavList">
              ${this.navItems.map(item => {
                const badgeVal = item.badgeKey ? stats[item.badgeKey] : undefined;
                return `
                  <li class="nav-item">
                    <a href="#${item.path}" class="nav-link" data-nav-path="${item.path}">
                      <span class="nav-icon">${this.getIconSvg(item.icon)}</span>
                      <span class="nav-label">${escapeHtml(item.label)}</span>
                      ${badgeVal !== undefined ? `
                        <span class="nav-badge ${item.badgeStyle === 'coral' ? 'badge-coral' : ''}" data-badge-for="${item.path}">${badgeVal}</span>
                      ` : ''}
                    </a>
                  </li>
                `;
              }).join('')}
            </ul>
          </nav>

          <!-- Bottom Course Context Card & User Row (Reference Layout) -->
          <div class="sidebar-footer">
            
            <!-- Truthful active course context card -->
            <div class="sidebar-course-card" id="courseDropdownBtn" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">
              <div class="course-card-icon">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#006B6B" stroke-width="2">
                  <rect x="3" y="3" width="14" height="14" rx="3"/>
                  <path d="M7 7h6M7 10h6M7 13h4"/>
                </svg>
              </div>
              <div class="course-card-details">
                <span class="course-card-name" id="shellActiveCourseName" title="${escapeHtml(state.course ? state.course.name : 'No course selected')}">${escapeHtml(state.course ? state.course.name : 'No course selected')}</span>
              </div>
              <svg class="chevron-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 8l4 4 4-4"/>
              </svg>
            </div>

            <!-- Course Context Popover -->
            <div class="course-dropdown-menu" id="courseDropdownMenu" role="region" aria-label="Course Details">
              <div class="course-dropdown-header">
                <strong id="shellCourseHeaderTitle">${escapeHtml(state.course ? (state.course.code ? `${state.course.code}: ${state.course.name}` : state.course.name) : 'No course selected')}</strong>
                <span class="course-dropdown-sub" id="shellCourseHeaderSub">${escapeHtml(state.course && state.course.term ? `${state.course.term}${state.course.instructor ? ' • ' + state.course.instructor : ''}` : 'Manage courses in Syllabus Map')}</span>
              </div>
              <div class="course-dropdown-stats">
                <span class="course-stat-badge" id="shellCourseModulesBadge">${(state.topics || []).length} Syllabus Modules</span>
                <span class="course-stat-badge" id="shellCourseDocsBadge">${(state.documents || []).length} Academic Readings</span>
              </div>
            </div>

            <!-- User Account Row (Avatar, Name, Chevron right) -->
            <div class="sidebar-user-row" id="userCardBtn" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false" title="Account profile">
              <div class="user-avatar-sm" id="shellUserAvatar">${escapeHtml(user.avatarText)}</div>
              <div class="user-name-text" id="shellUserName">${escapeHtml(user.name)}</div>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 5l5 5-5 5"/>
              </svg>
            </div>

            <!-- User Menu Popup -->
            <div class="user-menu-dropdown" id="userMenuDropdown" role="menu">
              <div class="dropdown-user-header">
                <strong id="dropdownUserName">${escapeHtml(user.name)}</strong>
                <span id="dropdownUserEmail">${escapeHtml(user.email)}</span>
              </div>
              <hr class="dropdown-divider">
              <a href="#/app/settings" class="dropdown-item" id="userMenuSettingsLink">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Profile & Settings
              </a>
              <button type="button" class="dropdown-item text-danger" id="logoutBtn">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10h8m0 0l-3-3m3 3l-3 3M4 4h4v12H4z"/></svg>
                Log out
              </button>
            </div>
          </div>

        </aside>

        <!-- Right Main Column: Topbar + View Container -->
        <div class="workspace-main-column">
          
          <!-- Topbar (White surface, 64px tall) -->
          <header class="workspace-topbar" role="banner">
            
            <div class="topbar-left">
              <button type="button" class="mobile-drawer-toggle" id="drawerToggleBtn" aria-label="Open navigation menu">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>

              <!-- Mobile Topbar Brand (Visible when mobile drawer is closed) -->
              <a href="#/app/overview" class="mobile-topbar-brand" aria-label="Syllora Overview">
                <svg class="mobile-topbar-logo-svg" viewBox="150 250 960 840" aria-hidden="true">
                  <path fill="#0F766E" d="M 615 410 Q 560 300 312 274 Q 300 274 300 286 L 300 664 Q 300 676 312 676 Q 500 680 615 762 Z"/>
                  <path fill="#0F766E" d="M 638 410 Q 693 300 941 274 Q 953 274 953 286 L 953 664 Q 953 676 941 676 Q 753 680 638 762 Z"/>
                  <path fill="#FFFFFF" d="M 432 494 Q 520 540 615 586 L 637 556 Q 760 455 884 372 Q 897 366 893 381 Q 760 520 682 618 Q 641 676 628 742 Q 610 690 590 660 Q 512 572 434 503 Q 427 497 432 494 Z"/>
                </svg>
                <span class="mobile-topbar-brand-title">Syllora</span>
              </a>

              <!-- Breadcrumb Trail: "Workspace / Overview" (Matching Reference) -->
              <nav class="breadcrumb-trail" aria-label="Breadcrumb">
                <span class="breadcrumb-root">Workspace</span>
                <span class="breadcrumb-sep">/</span>
                <span class="breadcrumb-current" id="shellBreadcrumbCurrent">Overview</span>
              </nav>
            </div>

            <!-- Topbar Actions & Global Search -->
            <div class="topbar-right">
              
              <!-- Quick Search Input (Search your materials... ⌘ K) -->
              <div class="topbar-search-box">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="18" y2="18"/>
                </svg>
                <input type="text" id="topbarSearchInput" placeholder="Search your materials..." class="topbar-search-input" aria-label="Search materials">
                <kbd class="kbd-shortcut">⌘ K</kbd>
              </div>

              <!-- Notifications Bell -->
              <div class="notification-wrap">
                <button type="button" class="topbar-icon-btn" id="notificationsBtn" aria-label="View notifications" aria-haspopup="true" aria-expanded="false">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zM8 17a2 2 0 0 0 4 0"/>
                  </svg>
                  <span class="notification-badge" id="shellNotificationBadge" style="${stats.openMisconceptionsCount > 0 ? '' : 'display:none;'}">${stats.openMisconceptionsCount}</span>
                </button>

                <!-- Notifications Dropdown -->
                <div class="notifications-dropdown" id="notificationsDropdown" role="region" aria-label="Course notifications">
                  <div class="dropdown-header">
                    <h4>Course Notifications</h4>
                    <span class="badge-tag" id="shellNotifActiveTag">${stats.openMisconceptionsCount} Active</span>
                  </div>
                  <div class="notifications-list">
                    ${(state.misconceptions || []).filter(m => m.status !== 'Student-marked complete').slice(0, 3).map(m => `
                      <a href="#/app/misconceptions" class="notification-item">
                        <div class="notif-dot coral"></div>
                        <div class="notif-text">
                          <strong>Open Misconception:</strong> ${escapeHtml(m.topicTitle || 'Review needed')}
                          <span class="notif-time">${escapeHtml(m.lastAttemptDate || 'Recent')}</span>
                        </div>
                      </a>
                    `).join('')}
                    ${(state.revisionTasks || []).filter(t => !t.completed).slice(0, 2).map(t => `
                      <a href="#/app/revision" class="notification-item">
                        <div class="notif-dot amber"></div>
                        <div class="notif-text">
                          <strong>Revision Task:</strong> ${escapeHtml(t.title)}
                          <span class="notif-time">${escapeHtml(t.scheduledDate || 'Upcoming')}</span>
                        </div>
                      </a>
                    `).join('')}
                    ${(!state.misconceptions || state.misconceptions.filter(m => m.status !== 'Student-marked complete').length === 0) &&
                      (!state.revisionTasks || state.revisionTasks.filter(t => !t.completed).length === 0) ? `
                      <div class="notification-item" style="padding: 16px; text-align: center; color: #64748B;">
                        No pending notifications
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- Topbar User Profile Avatar (Reference match) -->
              <div class="topbar-user-wrap">
                <button type="button" class="topbar-avatar-btn" id="topbarAvatarBtn" aria-label="User profile menu" aria-haspopup="true">
                  <div class="user-avatar-sm" id="topbarUserAvatar">${escapeHtml(user.avatarText)}</div>
                </button>
              </div>

            </div>

          </header>

          <!-- Router Mount View Container (Light Mode Canvas #F5F8FA) -->
          <main class="workspace-view-content" id="workspaceViewMount" tabindex="-1">
            <!-- Child View Rendered Here -->
          </main>

        </div>

      </div>
    `;

    this.isMounted = true;
    this.bindEvents();
  }

  setActivePath(activePath) {
    this.currentPath = activePath;

    // Update active nav-links in place
    const navLinks = this.container.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      const path = link.getAttribute('data-nav-path');
      link.classList.toggle('active', path === activePath);
    });

    // Update breadcrumb current label
    const currentNav = this.navItems.find(n => n.path === activePath) || { label: 'Overview' };
    const breadcrumbCurrent = this.container.querySelector('#shellBreadcrumbCurrent');
    if (breadcrumbCurrent) {
      breadcrumbCurrent.textContent = currentNav.label;
    }

    // Refresh badge stats
    this.updateStats();

    // Close mobile drawer and open dropdowns
    this.closeAllMenus();
  }

  updateUser() {
    const user = sessionAdapter.getUser() || { name: 'Student', email: '', role: 'Student', avatarText: 'ST' };

    const avatar = this.container.querySelector('#shellUserAvatar');
    const topbarAvatar = this.container.querySelector('#topbarUserAvatar');
    const name = this.container.querySelector('#shellUserName');
    const dName = this.container.querySelector('#dropdownUserName');
    const dEmail = this.container.querySelector('#dropdownUserEmail');

    if (avatar) avatar.textContent = user.avatarText || 'ST';
    if (topbarAvatar) topbarAvatar.textContent = user.avatarText || 'ST';
    if (name) name.textContent = user.name || 'Student';
    if (dName) dName.textContent = user.name || 'Student';
    if (dEmail) dEmail.textContent = user.email || '';
  }

  updateStats() {
    const state = workspaceStore.getState();
    const stats = workspaceStore.getStats();

    this.navItems.forEach(item => {
      if (item.badgeKey) {
        const badgeEl = this.container.querySelector(`[data-badge-for="${item.path}"]`);
        if (badgeEl) {
          badgeEl.textContent = stats[item.badgeKey];
        }
      }
    });

    const notifBadge = this.container.querySelector('#shellNotificationBadge');
    if (notifBadge) {
      notifBadge.textContent = stats.openMisconceptionsCount;
      notifBadge.style.display = stats.openMisconceptionsCount > 0 ? '' : 'none';
    }

    const notifTag = this.container.querySelector('#shellNotifActiveTag');
    if (notifTag) notifTag.textContent = `${stats.openMisconceptionsCount} Active`;

    // Dynamic course card refresh
    const courseCardName = this.container.querySelector('#shellActiveCourseName');
    if (courseCardName) {
      courseCardName.textContent = state.course ? state.course.name : 'No course selected';
    }
    const courseHeaderTitle = this.container.querySelector('#shellCourseHeaderTitle');
    if (courseHeaderTitle) {
      courseHeaderTitle.textContent = state.course ? (state.course.code ? `${state.course.code}: ${state.course.name}` : state.course.name) : 'No course selected';
    }
    const courseHeaderSub = this.container.querySelector('#shellCourseHeaderSub');
    if (courseHeaderSub) {
      courseHeaderSub.textContent = state.course && state.course.term ? `${state.course.term}${state.course.instructor ? ' • ' + state.course.instructor : ''}` : 'Manage courses in Syllabus Map';
    }
    const courseModulesBadge = this.container.querySelector('#shellCourseModulesBadge');
    if (courseModulesBadge) {
      courseModulesBadge.textContent = `${(state.topics || []).length} Syllabus Modules`;
    }
    const courseDocsBadge = this.container.querySelector('#shellCourseDocsBadge');
    if (courseDocsBadge) {
      courseDocsBadge.textContent = `${(state.documents || []).length} Academic Readings`;
    }
  }

  setDrawerState(isOpen) {
    this.isDrawerOpen = isOpen;
    const sidebar = this.container.querySelector('#workspaceSidebar');
    const backdrop = this.container.querySelector('#drawerBackdrop');
    const toggleBtn = this.container.querySelector('#drawerToggleBtn');

    if (sidebar) sidebar.classList.toggle('drawer-open', isOpen);
    if (backdrop) {
      backdrop.classList.toggle('visible', isOpen);
      backdrop.classList.toggle('active', isOpen);
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
    document.body.classList.toggle('drawer-open', isOpen);
  }

  closeAllMenus() {
    if (this.isDrawerOpen) {
      this.setDrawerState(false);
    }

    if (this.isUserMenuOpen) {
      this.isUserMenuOpen = false;
      const userMenuDropdown = this.container.querySelector('#userMenuDropdown');
      const userCardBtn = this.container.querySelector('#userCardBtn');
      const topbarAvatarBtn = this.container.querySelector('#topbarAvatarBtn');
      if (userMenuDropdown) userMenuDropdown.classList.remove('visible');
      if (userCardBtn) userCardBtn.setAttribute('aria-expanded', 'false');
      if (topbarAvatarBtn) topbarAvatarBtn.setAttribute('aria-expanded', 'false');
    }

    if (this.isNotificationOpen) {
      this.isNotificationOpen = false;
      const notificationsDropdown = this.container.querySelector('#notificationsDropdown');
      const notificationsBtn = this.container.querySelector('#notificationsBtn');
      if (notificationsDropdown) notificationsDropdown.classList.remove('visible');
      if (notificationsBtn) notificationsBtn.setAttribute('aria-expanded', 'false');
    }

    if (this.isCourseMenuOpen) {
      this.isCourseMenuOpen = false;
      const courseDropdownMenu = this.container.querySelector('#courseDropdownMenu');
      const courseDropdownBtn = this.container.querySelector('#courseDropdownBtn');
      if (courseDropdownMenu) courseDropdownMenu.classList.remove('visible');
      if (courseDropdownBtn) courseDropdownBtn.setAttribute('aria-expanded', 'false');
    }
  }

  bindEvents() {
    // Drawer toggle on mobile
    const drawerToggleBtn = this.container.querySelector('#drawerToggleBtn');
    const drawerBackdrop = this.container.querySelector('#drawerBackdrop');

    if (drawerToggleBtn) {
      drawerToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setDrawerState(!this.isDrawerOpen);
      });
    }

    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', () => {
        this.setDrawerState(false);
      });
    }

    // Defect J: Align resize listener to CSS desktop threshold (>1024px)
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024 && this.isDrawerOpen) {
        this.setDrawerState(false);
      }
    }, { passive: true });

    // Workspace switcher button
    const workspaceSwitcherBtn = this.container.querySelector('#workspaceSwitcherBtn');
    if (workspaceSwitcherBtn) {
      workspaceSwitcherBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const course = workspaceStore.getState().course;
        Toast.show(course ? `Active workspace: ${course.name}` : 'No active course. Create one in Syllabus Map.', 'info');
      });
    }

    // Course selector dropdown toggle in footer
    const courseDropdownBtn = this.container.querySelector('#courseDropdownBtn');
    const courseDropdownMenu = this.container.querySelector('#courseDropdownMenu');
    if (courseDropdownBtn && courseDropdownMenu) {
      courseDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isCourseMenuOpen = !this.isCourseMenuOpen;
        courseDropdownMenu.classList.toggle('visible', this.isCourseMenuOpen);
        courseDropdownBtn.setAttribute('aria-expanded', this.isCourseMenuOpen);
      });

      courseDropdownBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          courseDropdownBtn.click();
        }
      });
    }

    // User menu toggle from sidebar user card and topbar avatar
    const userCardBtn = this.container.querySelector('#userCardBtn');
    const topbarAvatarBtn = this.container.querySelector('#topbarAvatarBtn');
    const userMenuDropdown = this.container.querySelector('#userMenuDropdown');
    const logoutBtn = this.container.querySelector('#logoutBtn');

    const toggleUserMenu = (e) => {
      e.stopPropagation();
      this.isUserMenuOpen = !this.isUserMenuOpen;
      if (userMenuDropdown) userMenuDropdown.classList.toggle('visible', this.isUserMenuOpen);
      if (userCardBtn) userCardBtn.setAttribute('aria-expanded', this.isUserMenuOpen);
      if (topbarAvatarBtn) topbarAvatarBtn.setAttribute('aria-expanded', this.isUserMenuOpen);
    };

    if (userCardBtn) {
      userCardBtn.addEventListener('click', toggleUserMenu);
      userCardBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleUserMenu(e);
        }
      });
    }

    if (topbarAvatarBtn) {
      topbarAvatarBtn.addEventListener('click', toggleUserMenu);
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.closeAllMenus();
        Modal.open(
          'Confirm Logout',
          '<p>Are you sure you want to log out of Syllora? Your session will end and return to the sign in page.</p>',
          () => {
            sessionAdapter.logout();
            Toast.show('You have logged out successfully.', 'info');
          },
          'Log Out',
          'danger'
        );
      });
    }

    // Notifications toggle
    const notificationsBtn = this.container.querySelector('#notificationsBtn');
    const notificationsDropdown = this.container.querySelector('#notificationsDropdown');

    if (notificationsBtn && notificationsDropdown) {
      notificationsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isNotificationOpen = !this.isNotificationOpen;
        notificationsDropdown.classList.toggle('visible', this.isNotificationOpen);
        notificationsBtn.setAttribute('aria-expanded', this.isNotificationOpen);
      });
    }

    // Topbar Search Enter Action
    const topbarSearchInput = this.container.querySelector('#topbarSearchInput');
    if (topbarSearchInput) {
      topbarSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = topbarSearchInput.value.trim();
          if (q) {
            router.navigate('/app/ask', { q });
            topbarSearchInput.value = '';
          }
        }
      });
    }

    // Global outside click listener to close popups
    window.addEventListener('click', () => {
      this.closeAllMenus();
    });

    // Global keyboard listener (Escape closes popovers, Ctrl+K / Cmd+K focuses search)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllMenus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (topbarSearchInput) topbarSearchInput.focus();
      }
    });
  }

  // Backwards compatibility alias
  render(activePath) {
    this.mount();
    this.setActivePath(activePath);
  }
}
