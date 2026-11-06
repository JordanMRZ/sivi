import { Routes } from '@angular/router';
import { Entrar } from './pages/entrar';
import { Home } from './pages/home';
import { Profesor } from './pages/profesor';
import { Sala } from './pages/sala';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'profesor', component: Profesor },
  { path: 'profesor/nueva', redirectTo: 'profesor' },
  { path: 'profesor/p/:codigo', redirectTo: 'profesor' },
  { path: 'entrar', component: Entrar },
  { path: 'sala', component: Sala },
  { path: '**', redirectTo: '' },
];
