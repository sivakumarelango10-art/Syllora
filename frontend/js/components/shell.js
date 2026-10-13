/**
 * ============================================================================
 * SYLLORA APPSHELL COMPONENT
 * ============================================================================
 * Persistent white sidebar (~230px), top navigation bar with breadcrumb & global
 * search, notification menu, mobile drawer, and demo user session integration.
 */

import { router } from '../router.js';
import { sessionAdapter } from '../session.js';
import { workspaceStore } from '../state.js';
import { Toast, Modal } from './modal.js';

export class AppShell {
  constructor(containerId = 'workspaceAppShell') {
    this.container = document.getElementById(containerId);
    this.isDrawerOpen = false;
    this.isNotificationOpen = false;
    this.isUserMenuOpen = false;
  }

  render(activePath) {
    const user = sessionAdapter.getDemoUser() || { name: 'Prajith P', email: 'demo@syllora.com', avatarText: 'PP' };
    const stats = workspaceStore.getStats();

    // Map path to title
    const navItems = [
      { path: '/app/overview', label: 'Overview', icon: 'grid' },
      { path: '/app/materials', label: 'Study materials', icon: 'book', badge: stats.totalDocs },
      { path: '/app/ask', label: 'Ask Syllora', icon: 'sparkle' },
      { path: '/app/syllabus', label: 'Syllabus map', icon: 'map' },
      { path: '/app/understanding', label: 'Check understanding', icon: 'check-circle' },
      { path: '/app/misconceptions', label: 'Misconception notebook', icon: 'notebook', badge: stats.openMisconceptionsCount, badgeStyle: 'coral' },
      { path: '/app/revision', label: 'Revision planner', icon: 'calendar', badge: stats.pendingTasksCount },
      { path: '/app/settings', label: 'Settings', icon: 'gear' }
    ];

    const currentNav = navItems.find(n => n.path === activePath) || { label: 'Overview' };

    const getIconSvg = (name) => {
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
          return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        default:
          return '';
      }
    };

    this.container.innerHTML = `
      <div class="workspace-layout">

        <!-- Mobile Drawer Backdrop -->
        <div class="drawer-backdrop" id="drawerBackdrop"></div>

        <!-- Desktop Sidebar (230px wide, White surface) -->
        <aside class="workspace-sidebar" id="workspaceSidebar">
          
          <!-- Logo & Brand Header -->
          <div class="sidebar-brand-header">
            <div class="brand-logo-lockup">
              <!-- Inline Syllora Book Logo -->
              <svg class="sidebar-logo-svg" viewBox="150 250 960 840" width="130" height="34" aria-hidden="true">
                <path fill="#0F766E" d="M 615 410 Q 560 300 312 274 Q 300 274 300 286 L 300 664 Q 300 676 312 676 Q 500 680 615 762 Z"/>
                <path fill="#0F766E" d="M 638 410 Q 693 300 941 274 Q 953 274 953 286 L 953 664 Q 953 676 941 676 Q 753 680 638 762 Z"/>
                <path fill="#FFFFFF" d="M 432 494 Q 520 540 615 586 L 637 556 Q 760 455 884 372 Q 897 366 893 381 Q 760 520 682 618 Q 641 676 628 742 Q 610 690 590 660 Q 512 572 434 503 Q 427 497 432 494 Z"/>
                <g fill="#17252B">
                  <path d="M175.6 952.7H216.9Q217.7 964.5 225.3 971.4Q232.8 978.3 246 978.3Q259.5 978.3 267.2 971.8Q274.9 965.4 274.9 954.9Q274.9 946.4 269.7 940.9Q264.5 935.4 256.6 932.2Q248.8 929.1 235 925.2Q216.3 919.7 204.7 914.4Q193 909 184.6 898.1Q176.2 887.3 176.2 869.1Q176.2 852.1 184.7 839.4Q193.2 826.8 208.6 820Q224 813.3 243.8 813.3Q273.5 813.3 292.1 827.7Q310.7 842.2 312.6 868H270.2Q269.7 858.1 261.9 851.7Q254 845.2 241.1 845.2Q229.8 845.2 223.1 851Q216.3 856.8 216.3 867.8Q216.3 875.5 221.4 880.5Q226.5 885.6 234.1 888.8Q241.6 892 255.4 896.1Q274.1 901.6 285.9 907.1Q297.7 912.6 306.3 923.6Q314.8 934.6 314.8 952.5Q314.8 967.9 306.8 981Q298.8 994.2 283.4 1002.1Q268 1009.9 246.9 1009.9Q226.8 1009.9 210.7 1003Q194.6 996.2 185.3 983.2Q175.9 970.3 175.6 952.7Z"/>
                  <path d="M488.8 855.6 394.5 1080H353.5L386.5 1004.1L325.5 855.6H368.6L408 962.1L447.8 855.6Z"/>
                  <path d="M542.9 804.5V1008H504.4V804.5Z"/>
                  <path d="M614.4 804.5V1008H575.9V804.5Z"/>
                  <path d="M637.7 931.8Q637.7 908.5 648 890.6Q658.4 872.7 676.2 862.9Q694.1 853.2 716.1 853.2Q738.1 853.2 756 862.9Q773.9 872.7 784.2 890.6Q794.5 908.5 794.5 931.8Q794.5 955.2 783.9 973.1Q773.3 991 755.3 1000.7Q737.3 1010.5 715 1010.5Q693 1010.5 675.4 1000.7Q657.8 991 647.8 973.1Q637.7 955.2 637.7 931.8ZM754.9 931.8Q754.9 910.1 743.5 898.4Q732 886.7 715.5 886.7Q699 886.7 687.9 898.4Q676.8 910.1 676.8 931.8Q676.8 953.5 687.6 965.2Q698.5 976.9 715 976.9Q725.5 976.9 734.7 971.8Q743.9 966.8 749.4 956.6Q754.9 946.4 754.9 931.8Z"/>
                  <path d="M903.1 853.5V893.9H892.9Q874.7 893.9 865.5 902.4Q856.3 910.9 856.3 932.1V1008H817.8V855.6H856.3V879.3Q863.7 867.2 875.7 860.3Q887.7 853.5 903.1 853.5Z"/>
                  <path d="M983.6 853.2Q1000.6 853.2 1013.4 860Q1026.2 866.9 1033.9 877.4V855.6H1072.7V1008H1033.9V985.7Q1026.5 996.5 1013.4 1003.5Q1000.3 1010.5 983.3 1010.5Q964 1010.5 948.2 1000.6Q932.4 990.7 923.2 972.7Q914 954.6 914 931.3Q914 908.2 923.2 890.3Q932.4 872.4 948.2 862.8Q964 853.2 983.6 853.2ZM993.5 887Q982.8 887 973.7 892.2Q964.6 897.5 959 907.5Q953.3 917.5 953.3 931.3Q953.3 945 959 955.3Q964.6 965.6 973.8 971.1Q983 976.6 993.5 976.6Q1004.2 976.6 1013.5 971.3Q1022.9 965.9 1028.4 955.9Q1033.9 945.9 1033.9 931.8Q1033.9 917.8 1028.4 907.8Q1022.9 897.7 1013.5 892.4Q1004.2 887 993.5 887Z"/>
                </g>
              </svg>
            </div>
            <span class="demo-tag">Sample Workspace</span>
          </div>

          <!-- Course Selector Dropdown -->
          <div class="sidebar-course-selector">
            <label class="selector-label">Course Context</label>
            <div class="course-dropdown">
              <span class="course-code-pill">CS301</span>
              <span class="course-name-text">Operating Systems</span>
              <svg class="chevron-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 8l4 4 4-4"/>
              </svg>
            </div>
          </div>

          <!-- Primary Navigation -->
          <nav class="sidebar-nav" aria-label="Main Application Navigation">
            <ul class="nav-list">
              ${navItems.map(item => `
                <li class="nav-item">
                  <a href="#${item.path}" class="nav-link ${activePath === item.path ? 'active' : ''}">
                    <span class="nav-icon">${getIconSvg(item.icon)}</span>
                    <span class="nav-label">${item.label}</span>
                    ${item.badge !== undefined ? `
                      <span class="nav-badge ${item.badgeStyle === 'coral' ? 'badge-coral' : ''}">${item.badge}</span>
                    ` : ''}
                  </a>
                </li>
              `).join('')}
            </ul>
          </nav>

          <!-- Bottom Profile / User Card -->
          <div class="sidebar-footer">
            <div class="user-card" id="userCardBtn" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">
              <div class="user-avatar">${user.avatarText}</div>
              <div class="user-details">
                <span class="user-name">${user.name}</span>
                <span class="user-role">${user.role}</span>
              </div>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 8l4 4 4-4"/>
              </svg>
            </div>

            <!-- User Menu Popup -->
            <div class="user-menu-dropdown" id="userMenuDropdown">
              <div class="dropdown-user-header">
                <strong>${user.name}</strong>
                <span>${user.email}</span>
              </div>
              <hr class="dropdown-divider">
              <a href="#/app/settings" class="dropdown-item">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="3"/></svg>
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
          
          <!-- Topbar (White surface, bordered) -->
          <header class="workspace-topbar">
            
            <div class="topbar-left">
              <button type="button" class="mobile-drawer-toggle" id="drawerToggleBtn" aria-label="Open navigation menu">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>

              <!-- Breadcrumb -->
              <nav class="breadcrumb-trail" aria-label="Breadcrumb">
                <span class="breadcrumb-root">CS301: Operating Systems</span>
                <span class="breadcrumb-sep">/</span>
                <span class="breadcrumb-current">${currentNav.label}</span>
              </nav>
            </div>

            <!-- Topbar Actions & Global Search -->
            <div class="topbar-right">
              
              <!-- Quick Search Input -->
              <div class="topbar-search-box">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="18" y2="18"/>
                </svg>
                <input type="text" id="topbarSearchInput" placeholder="Search materials, topics, questions..." class="topbar-search-input">
                <kbd class="kbd-shortcut">Ctrl K</kbd>
              </div>

              <!-- Notifications Bell -->
              <div class="notification-wrap">
                <button type="button" class="topbar-icon-btn" id="notificationsBtn" aria-label="View notifications">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zM8 17a2 2 0 0 0 4 0"/>
                  </svg>
                  <span class="notification-badge">${stats.openMisconceptionsCount}</span>
                </button>

                <!-- Notifications Dropdown -->
                <div class="notifications-dropdown" id="notificationsDropdown">
                  <div class="dropdown-header">
                    <h4>Course Notifications</h4>
                    <span class="badge-tag">${stats.openMisconceptionsCount} Active</span>
                  </div>
                  <div class="notifications-list">
                    <a href="#/app/misconceptions" class="notification-item">
                      <div class="notif-dot coral"></div>
                      <div class="notif-text">
                        <strong>Open Misconception:</strong> Deadlock vs Starvation definition review needed.
                        <span class="notif-time">2 days ago</span>
                      </div>
                    </a>
                    <a href="#/app/revision" class="notification-item">
                      <div class="notif-dot amber"></div>
                      <div class="notif-text">
                        <strong>Revision Task Due:</strong> Coffman Conditions exam practice.
                        <span class="notif-time">Today</span>
                      </div>
                    </a>
                  </div>
                </div>
              </div>

              <!-- Workspace Status Pill -->
              <span class="workspace-pill">
                <span class="status-pulse-dot"></span>
                CS301 Fall '26
              </span>

            </div>

          </header>

          <!-- Router Mount View Container (Light Mode Canvas #F5F7F8) -->
          <main class="workspace-view-content" id="workspaceViewMount" tabindex="-1">
            <!-- Child View Rendered Here -->
          </main>

        </div>

      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Drawer toggle on mobile
    const drawerToggleBtn = this.container.querySelector('#drawerToggleBtn');
    const drawerBackdrop = this.container.querySelector('#drawerBackdrop');
    const sidebar = this.container.querySelector('#workspaceSidebar');

    const toggleDrawer = (open) => {
      this.isDrawerOpen = open;
      sidebar.classList.toggle('drawer-open', open);
      drawerBackdrop.classList.toggle('visible', open);
    };

    if (drawerToggleBtn) drawerToggleBtn.addEventListener('click', () => toggleDrawer(!this.isDrawerOpen));
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => toggleDrawer(false));

    // User menu toggle
    const userCardBtn = this.container.querySelector('#userCardBtn');
    const userMenuDropdown = this.container.querySelector('#userMenuDropdown');
    const logoutBtn = this.container.querySelector('#logoutBtn');

    if (userCardBtn && userMenuDropdown) {
      userCardBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isUserMenuOpen = !this.isUserMenuOpen;
        userMenuDropdown.classList.toggle('visible', this.isUserMenuOpen);
        userCardBtn.setAttribute('aria-expanded', this.isUserMenuOpen);
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
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
          }
        }
      });
    }

    // Global click listener to close dropdowns
    window.addEventListener('click', () => {
      if (this.isUserMenuOpen && userMenuDropdown) {
        userMenuDropdown.classList.remove('visible');
        this.isUserMenuOpen = false;
      }
      if (this.isNotificationOpen && notificationsDropdown) {
        notificationsDropdown.classList.remove('visible');
        this.isNotificationOpen = false;
      }
    });

    // Keyboard shortcut (Ctrl+K / Cmd+K)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        topbarSearchInput.focus();
      }
    });
  }
}
