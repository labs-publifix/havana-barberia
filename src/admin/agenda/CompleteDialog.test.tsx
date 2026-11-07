import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Appointment, Product } from '@/domain/types'
import { CompleteDialog } from './CompleteDialog'

const a = { id: 'a1', customer: { name: 'Ana Ríos' }, totalPrice: 280 } as Appointment
const cera = { id: 'cera', name: 'Cera mate', price: 150, active: true } as Product

describe('CompleteDialog', () => {
  it('charges products, a discount and a mixed payment in one ticket', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <CompleteDialog
        appointment={a}
        open
        busy={false}
        error={null}
        onCancel={() => {}}
        onConfirm={onConfirm}
        products={[cera]}
        canAuthorize={false}
      />,
    )
    await user.click(screen.getByRole('switch', { name: 'Agregar productos' }))
    await user.click(screen.getByRole('button', { name: 'Agregar uno de Cera mate' }))
    await user.click(screen.getByRole('switch', { name: 'Aplicar descuento' }))
    await user.type(screen.getByLabelText('Descuento'), '30')
    await user.type(screen.getByLabelText('Motivo'), 'Cliente frecuente')
    await user.click(screen.getByRole('button', { name: /Completar/ }))
    expect(screen.getByText(/correo y la contraseña del dueño o gerente/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Correo de quien autoriza'), 'gerencia@havana.test')
    await user.type(screen.getByLabelText('Contraseña'), 'demo1234')
    await user.click(screen.getByRole('switch', { name: 'Pago mixto' }))
    await user.type(screen.getByLabelText('Efectivo'), '200')
    expect(screen.getByText('Faltan $200 de $400.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Tarjeta'), '200')
    await user.click(screen.getByRole('button', { name: 'Completar · $400' }))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'cash',
        splits: [
          { method: 'cash', amount: 200 },
          { method: 'card', amount: 200 },
        ],
        products: [{ productId: 'cera', qty: 1 }],
        discount: {
          amount: 30,
          reason: 'Cliente frecuente',
          authorizer: { email: 'gerencia@havana.test', password: 'demo1234' },
        },
      }),
      expect.any(Boolean),
    )
  })
})
