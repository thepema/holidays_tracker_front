import { Component, OnInit } from '@angular/core';
import { ApiService } from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly title = 'Holidays Tracker';
  protected apiResponse = '';
  protected errorMessage = '';
  protected loading = true;

  constructor(private readonly apiService: ApiService) {}

  ngOnInit(): void {
    this.apiService.getValue().subscribe({
      next: (value: unknown) => {
        this.apiResponse = typeof value === 'string'
          ? value
          : JSON.stringify(value, null, 2) ?? String(value);
        this.loading = false;
      },
      error: (error: unknown) => {
        console.error('Error al consultar la API:', error);
        this.errorMessage = 'No se pudo obtener la respuesta de la API.';
        this.loading = false;
      },
    });
  }
}
