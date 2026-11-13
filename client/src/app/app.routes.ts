import { Routes } from '@angular/router';
import { Entrar } from './pages/entrar';
import { Profesor } from './pages/profesor';
import { Sala } from './pages/sala';
import { RUTA_DOCENTE } from './ruta-docente';
import { PaginaNoEncontrada } from './estado-pagina';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  { path: RUTA_DOCENTE, component: Profesor },
  { path: 'profesor', pathMatch: 'full', redirectTo: 'entrar' },
  { path: 'entrar', component: Entrar },
  { path: 'sala', component: Sala },
  { path: '**', component: PaginaNoEncontrada },
];
