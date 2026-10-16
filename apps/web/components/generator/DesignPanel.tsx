'use client'

import {
  BRAND_ICONS,
  isVectorLogo,
  DOT_STYLES,
  EYE_BALL_STYLES,
  EYE_FRAME_STYLES,
  FRAME_STYLES,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  type Design,
  type DotStyle,
  type EyeBallStyle,
  type EyeFrameStyle,
  type Fill,
  type FrameStyle,
} from '@qrfinity/core'
import { ArrowLeftRight, ImagePlus, RotateCcw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { brandIconUrl, useBrand } from '@/lib/brand-logo'
import { useGenerator } from '@/lib/generator-context'
import { LogoError, processLogo } from '@/lib/logo'
import { Button } from '../ui/Button'
import { ColorField } from '../ui/ColorField'
import { Checkbox, SelectField, Slider, TextField } from '../ui/Field'
import { OptionGroup } from '../ui/OptionGroup'
import { Section } from '../ui/Section'
import { DotIcon, EyeBallIcon, EyeFrameIcon, FrameIcon } from './StyleIcons'
import { Templates } from './Templates'

const DOT_LABELS: Record<DotStyle, string> = {
  square: 'Square',
  rounded: 'Rounded',
  fluid: 'Fluid',
  dots: 'Dots',
  diamond: 'Diamond',
}
const EYE_LABELS: Record<EyeFrameStyle | EyeBallStyle, string> = {
  square: 'Square',
  rounded: 'Rounded',
  circle: 'Circle',
  leaf: 'Leaf',
}
const FRAME_LABELS: Record<FrameStyle, string> = {
  none: 'None',
  'box-bottom': 'Label below',
  'box-top': 'Label above',
  'pill-bottom': 'Badge',
}
const FRAME_TEXT_PRESETS = ['Scan me', 'Menu', 'Review us', 'Wi-Fi', 'Follow us', 'Book now']

function primaryColor(fill: Fill): string {
  return fill.type === 'solid' ? fill.color : fill.from
}

export function DesignPanel() {
  const design = useGenerator((s) => s.design)
  const setDesign = useGenerator((s) => s.setDesign)
  const setFrame = useGenerator((s) => s.setFrame)
  const resetDesign = useGenerator((s) => s.resetDesign)

  return (
    <div>
      <Section title="Pattern" summary="Squares, dots and the corner eyes" defaultOpen>
        <OptionGroup
          label="Pattern"
          value={design.dotStyle}
          onChange={(dotStyle) => setDesign({ dotStyle })}
          columns="grid-cols-3 sm:grid-cols-5"
          options={DOT_STYLES.map((s) => ({
            value: s,
            label: DOT_LABELS[s],
            icon: <DotIcon style={s} />,
          }))}
        />
        <OptionGroup
          label="Corner frames"
          value={design.eyeFrameStyle}
          onChange={(eyeFrameStyle) => setDesign({ eyeFrameStyle })}
          options={EYE_FRAME_STYLES.map((s) => ({
            value: s,
            label: EYE_LABELS[s],
            icon: <EyeFrameIcon style={s} />,
          }))}
        />
        <OptionGroup
          label="Corner centres"
          value={design.eyeBallStyle}
          onChange={(eyeBallStyle) => setDesign({ eyeBallStyle })}
          options={EYE_BALL_STYLES.map((s) => ({
            value: s,
            label: EYE_LABELS[s],
            icon: <EyeBallIcon style={s} />,
          }))}
        />
      </Section>

      <ColoursSection design={design} setDesign={setDesign} />
      <LogoSection design={design} setDesign={setDesign} />

      <Section title="Frame" summary="A call to action around the code">
        <OptionGroup
          label="Frame style"
          value={design.frame.style}
          onChange={(style) => setFrame({ style })}
          options={FRAME_STYLES.map((s) => ({
            value: s,
            label: FRAME_LABELS[s],
            icon: <FrameIcon style={s} />,
          }))}
        />
        {design.frame.style !== 'none' ? (
          <>
            <TextField
              label="Frame text"
              value={design.frame.text}
              maxLength={32}
              onChange={(e) => setFrame({ text: e.target.value })}
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested frame text">
              {FRAME_TEXT_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFrame({ text: t })}
                  className="label min-h-9 rounded-pill border-[1.5px] border-control-border bg-surface px-3 text-ink hover:bg-surface-sunk"
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                label="Frame colour"
                value={design.frame.color}
                onChange={(color) => setFrame({ color })}
              />
              <ColorField
                label="Text colour"
                value={design.frame.textColor}
                onChange={(textColor) => setFrame({ textColor })}
              />
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Advanced" summary="Error correction and margin">
        <SelectField
          label="Error correction"
          value={design.logo ? 'H' : design.ecc}
          disabled={!!design.logo}
          onChange={(ecc) => setDesign({ ecc })}
          hint={
            design.logo
              ? 'Set to high because of the logo, so the code still scans with part of it covered.'
              : 'Higher levels survive scratches and smudges but make a denser code.'
          }
          options={[
            { value: 'auto', label: 'Automatic (recommended)' },
            { value: 'L', label: 'Low: recovers 7%' },
            { value: 'M', label: 'Medium: recovers 15%' },
            { value: 'Q', label: 'Quartile: recovers 25%' },
            { value: 'H', label: 'High: recovers 30%' },
          ]}
        />
        <Slider
          label="Margin (quiet zone)"
          value={design.quietZone}
          min={0}
          max={10}
          step={1}
          onChange={(quietZone) => setDesign({ quietZone })}
          format={(v) => `${v} ${v === 1 ? 'module' : 'modules'}`}
        />
      </Section>

      <Section title="Saved designs" summary="Reuse a design on your next code">
        <Templates />
      </Section>

      <div className="border-t border-hairline pt-4">
        <Button
          icon={<RotateCcw aria-hidden="true" size={18} strokeWidth={1.75} />}
          onClick={resetDesign}
        >
          Reset design
        </Button>
      </div>
    </div>
  )
}

function ColoursSection({
  design,
  setDesign,
}: {
  design: Design
  setDesign: (p: Partial<Design>) => void
}) {
  const fill = design.foreground
  const customEyes = design.eyeFrameColor !== null || design.eyeBallColor !== null
  const setFill = (next: Fill) => setDesign({ foreground: next })

  return (
    <Section title="Colours" summary="Code, corners and background">
      <OptionGroup
        label="Code colour"
        value={fill.type}
        columns="grid-cols-3"
        onChange={(type) => {
          const a = primaryColor(fill)
          const b = fill.type === 'solid' ? '#0f5132' : fill.to
          setFill(
            type === 'solid'
              ? { type, color: a }
              : type === 'linear'
                ? { type, from: a, to: b, angle: 45 }
                : { type, from: a, to: b },
          )
        }}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'linear', label: 'Linear gradient' },
          { value: 'radial', label: 'Radial gradient' },
        ]}
      />
      {fill.type === 'solid' ? (
        <ColorField
          label="Code colour"
          value={fill.color}
          onChange={(color) => setFill({ type: 'solid', color })}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label={fill.type === 'radial' ? 'Centre colour' : 'Start colour'}
            value={fill.from}
            onChange={(from) => setFill({ ...fill, from })}
          />
          <ColorField
            label={fill.type === 'radial' ? 'Edge colour' : 'End colour'}
            value={fill.to}
            onChange={(to) => setFill({ ...fill, to })}
          />
          {fill.type === 'linear' ? (
            <div className="sm:col-span-2">
              <Slider
                label="Direction"
                value={fill.angle}
                min={0}
                max={360}
                step={15}
                onChange={(angle) => setFill({ ...fill, angle })}
                format={(v) => `${v}°`}
              />
            </div>
          ) : null}
        </div>
      )}

      <Checkbox
        label="Different colour for the corners"
        checked={customEyes}
        onChange={(on) =>
          setDesign(
            on
              ? { eyeFrameColor: primaryColor(fill), eyeBallColor: primaryColor(fill) }
              : { eyeFrameColor: null, eyeBallColor: null },
          )
        }
      />
      {customEyes ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label="Corner frames"
            value={design.eyeFrameColor ?? primaryColor(fill)}
            onChange={(eyeFrameColor) => setDesign({ eyeFrameColor })}
          />
          <ColorField
            label="Corner centres"
            value={design.eyeBallColor ?? primaryColor(fill)}
            onChange={(eyeBallColor) => setDesign({ eyeBallColor })}
          />
        </div>
      ) : null}

      <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
        <ColorField
          label="Background"
          value={design.background}
          onChange={(background) => setDesign({ background })}
        />
        <Button
          icon={<ArrowLeftRight aria-hidden="true" size={18} strokeWidth={1.75} />}
          disabled={fill.type !== 'solid' || design.transparentBackground}
          onClick={() =>
            fill.type === 'solid' &&
            setDesign({
              foreground: { type: 'solid', color: design.background },
              background: fill.color,
            })
          }
        >
          Swap colours
        </Button>
      </div>
      <Checkbox
        label="Transparent background"
        checked={design.transparentBackground}
        onChange={(transparentBackground) => setDesign({ transparentBackground })}
        hint="For PNG, SVG, PDF and EPS. JPG always gets a solid background."
      />
    </Section>
  )
}

type LogoChoice = 'auto' | 'none' | 'custom'

function LogoSection({
  design,
  setDesign,
}: {
  design: Design
  setDesign: (p: Partial<Design>) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // "Your own" picked but no file chosen yet: the code has no logo until one is.
  const [pendingCustom, setPendingCustom] = useState(false)
  const brand = useBrand()
  const brandName = brand ? BRAND_ICONS[brand] : null

  const choice: LogoChoice = design.logoAuto
    ? 'auto'
    : design.logo || pendingCustom
      ? 'custom'
      : 'none'

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      setDesign({ logo: await processLogo(file), logoAuto: false })
    } catch (e) {
      setError(
        e instanceof LogoError ? e.message : 'That image could not be opened. Try a PNG or JPG.',
      )
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  function choose(next: LogoChoice) {
    setError(null)
    setPendingCustom(next === 'custom')
    if (next === 'auto') setDesign({ logoAuto: true })
    else if (next === 'none') setDesign({ logoAuto: false, logo: null })
    else {
      setDesign({ logoAuto: false, logo: null })
      input.current?.click()
    }
  }

  const summary =
    choice === 'auto'
      ? brandName
        ? `The ${brandName} icon`
        : 'Automatic'
      : choice === 'custom'
        ? 'Your logo in the middle of the code'
        : 'No logo'

  return (
    <Section title="Logo" summary={summary}>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <OptionGroup
        label="Logo to show"
        hideLabel
        value={choice}
        onChange={choose}
        columns="grid-cols-3"
        options={[
          { value: 'auto', label: 'Automatic' },
          { value: 'none', label: 'None' },
          { value: 'custom', label: 'Your own' },
        ]}
      />
      {choice === 'auto' ? (
        <div className="flex flex-wrap items-center gap-3">
          {design.logo && brand && brandName ? (
            // eslint-disable-next-line @next/next/no-img-element -- static icon
            <img
              src={brandIconUrl(brand)}
              alt={`${brandName} icon`}
              className="size-14 rounded-sm border border-hairline bg-surface object-contain p-1"
            />
          ) : null}
          <p className="body-small min-w-0 flex-1 text-ink-muted">
            {brandName
              ? `Shows the ${brandName} icon because the code opens ${brandName}. Choose None or your own logo to change it.`
              : 'Adds the platform’s icon when the code opens WhatsApp, a social profile, an app store or another app we recognise. This code doesn’t, so it has no logo.'}
          </p>
        </div>
      ) : null}
      {choice === 'custom' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {design.logo && !isVectorLogo(design.logo) ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL
              <img
                src={design.logo.src}
                alt="Your logo"
                className="size-14 rounded-sm border border-hairline bg-surface object-contain p-1"
              />
            ) : null}
            <Button
              icon={<ImagePlus aria-hidden="true" size={18} strokeWidth={1.75} />}
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              {design.logo ? 'Change logo' : 'Add a logo'}
            </Button>
            {design.logo ? (
              <Button
                icon={<Trash2 aria-hidden="true" size={18} strokeWidth={1.75} />}
                onClick={() => choose('none')}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="body-small text-ink-muted" role={error ? 'alert' : undefined}>
            {error ??
              'Your logo stays on your device; it is never uploaded. PNG, JPG, WebP, GIF or SVG, up to 10 MB.'}
          </p>
        </>
      ) : null}
      {design.logo ? (
        <>
          <Slider
            label="Logo size"
            value={design.logoSize}
            min={LOGO_SIZE_MIN}
            max={LOGO_SIZE_MAX}
            step={0.01}
            onChange={(logoSize) => setDesign({ logoSize })}
            format={(v) => `${Math.round(v * 100)}% of the width`}
          />
          <Slider
            label="Space around the logo"
            value={design.logoMargin}
            min={0}
            max={3}
            step={0.5}
            onChange={(logoMargin) => setDesign({ logoMargin })}
            format={(v) => `${v} ${v === 1 ? 'module' : 'modules'}`}
          />
          <Checkbox
            label="Clear the code behind the logo"
            checked={design.clearBehindLogo}
            onChange={(clearBehindLogo) => setDesign({ clearBehindLogo })}
            hint="Recommended. The logo sits on a clean background instead of on top of the pattern."
          />
        </>
      ) : null}
    </Section>
  )
}
