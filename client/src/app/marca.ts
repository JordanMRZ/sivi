import { Component, computed, input } from '@angular/core';

const LOGOS = {
  principal: 'sivi-logo.svg',
  contorno: 'sivi-logo-contorno.svg',
  monocromatico: 'sivi-logo-monocromatico.svg',
  carga: 'sivi-logo-trazo.svg',
};

@Component({
  selector: 'app-marca',
  template: `
    <img class="marca" [src]="archivo()" width="1268" height="699" alt="SiVI" />
  `,
})
export class Marca {
  readonly variante = input<keyof typeof LOGOS>('principal');
  readonly archivo = computed(() => LOGOS[this.variante()]);
}
