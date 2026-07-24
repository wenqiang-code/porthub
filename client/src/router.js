import { createRouter, createWebHistory } from 'vue-router';
import Projects from './views/Projects.vue';
import Ports from './views/Ports.vue';
import Services from './views/Services.vue';
import Settings from './views/Settings.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', name: 'projects', component: Projects },
    { path: '/ports', name: 'ports', component: Ports },
    { path: '/services', name: 'services', component: Services },
    { path: '/settings', name: 'settings', component: Settings }
  ]
});
