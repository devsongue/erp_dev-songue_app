export type EmployeeStatus = 'Active' | 'OnLeave' | 'Terminated' | 'Onboarding'
export type Department = 'Direction' | 'Technique' | 'Ventes' | 'Marketing' | 'Ressources Humaines' | 'Finance'
export type ContractType = 'CDI' | 'CDD' | 'Freelance' | 'Stage'

export interface Employee {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  department: Department
  role: string
  manager?: string
  status: EmployeeStatus
  contractType: ContractType
  hireDate: string
  salary: number
  currency: string
}

export const hrDepartments: { id: Department; count: number }[] = []
export const hrEmployees: Employee[] = []
