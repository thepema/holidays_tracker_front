import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTeam } from '../../../../core/models/user.model';
import {
  MONTH_OPTIONS,
  getMonthLabel,
  getPreviousMonthAndYear,
} from '../../../../core/utils/excel-export';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-export-excel-modal',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  templateUrl: './export-excel-modal.component.html',
  styleUrl: './export-excel-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportExcelModalComponent implements OnInit {
  readonly exporting = input<boolean>(false);
  readonly availableYears = input<number[]>([]);
  readonly teams = input<AdminTeam[]>([]);
  readonly initialTeamId = input<number | null>(null);

  readonly exportExcel = output<{ month: number; year: number; equipoId: number | null }>();
  readonly cancel = output<void>();

  protected readonly months = MONTH_OPTIONS;
  protected readonly defaultPeriod = getPreviousMonthAndYear();

  protected readonly selectedMonth = signal<number>(this.defaultPeriod.month);
  protected readonly selectedYear = signal<number>(this.defaultPeriod.year);
  protected readonly selectedTeamId = signal<number | null>(null);

  protected readonly yearOptions = computed<number[]>(() => {
    const currentYear = new Date().getFullYear();
    const baseYears = new Set<number>([
      this.defaultPeriod.year,
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
      ...this.availableYears(),
    ]);
    return [...baseYears].filter((y) => Number.isFinite(y) && y > 1900).sort((a, b) => b - a);
  });

  protected readonly selectedPeriodLabel = computed<string>(
    () => `${getMonthLabel(this.selectedMonth())} ${this.selectedYear()}`
  );

  protected readonly selectedTeamName = computed<string | null>(() => {
    const id = this.selectedTeamId();
    if (id === null) {
      return null;
    }
    return this.teams().find((t) => t.id === id)?.nombre ?? null;
  });

  ngOnInit(): void {
    const prev = getPreviousMonthAndYear();
    this.selectedMonth.set(prev.month);
    this.selectedYear.set(prev.year);
    this.selectedTeamId.set(this.initialTeamId());
  }

  protected onYearChange(value: number | string): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 1900) {
      this.selectedYear.set(parsed);
    }
  }

  protected onTeamChange(value: number | string | null): void {
    if (value === null || value === '' || value === 'all') {
      this.selectedTeamId.set(null);
      return;
    }
    const parsed = Number(value);
    this.selectedTeamId.set(Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  }

  protected selectMonthChip(monthValue: number): void {
    this.selectedMonth.set(monthValue);
  }

  protected submitExport(): void {
    if (this.exporting()) {
      return;
    }
    this.exportExcel.emit({
      month: this.selectedMonth(),
      year: this.selectedYear(),
      equipoId: this.selectedTeamId(),
    });
  }
}
