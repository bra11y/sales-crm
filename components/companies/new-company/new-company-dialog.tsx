"use client";

import { useRef, useState, type FormEvent } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/_ui/select";
import { Slider } from "@/components/_ui/slider";
import SegmentBar from "@/components/_common/segment-bar";
import FormSection from "./form-section";
import { INTERACTION_TYPES, SEGMENTS, STAGES } from "@/data/companies";
import { TODAY } from "@/lib/companies";
import { createCompany } from "@/app/(crm)/actions";
import { useCompaniesStore } from "@/stores/companies-store";
import PlusIcon from "@/public/assets/images/_common/plus.svg";

type FormState = {
  name: string;
  segment: string;
  stage: string;
  owner: string;
  pipelineValue: string;
  winProbability: number;
  interactionDate: string;
  interactionType: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  segment: SEGMENTS[0],
  stage: STAGES[0],
  owner: "",
  pipelineValue: "",
  winProbability: 50,
  interactionDate: TODAY,
  interactionType: INTERACTION_TYPES[0],
};

export default function NewCompanyDialog() {
  const open = useCompaniesStore((state) => state.newCompanyOpen);
  const setOpen = useCompaniesStore((state) => state.setNewCompanyOpen);
  const addCompany = useCompaniesStore((state) => state.addCompany);
  const owners = useCompaniesStore((state) => state.owners);
  const currentUser = useCompaniesStore((state) => state.currentUser);
  const direct = useCompaniesStore((state) => state.products.find((p) => p.slug === "direct"));
  const segments = direct?.segments.length ? direct.segments : [...SEGMENTS];
  const stages = direct?.stages.length ? direct.stages : [...STAGES];
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ownerName = form.owner || currentUser.name;
  const nameRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setNameError("Company name: enter a name.");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await createCompany({
      name: form.name,
      segment: form.segment,
      stage: form.stage,
      ownerName,
      pipelineValue: Number(form.pipelineValue),
      winProbability: form.winProbability,
      interactionDate: form.interactionDate,
      interactionType: form.interactionType,
    });
    setSaving(false);
    if (!result.ok) {
      if (result.error.startsWith("Company name")) {
        setNameError(result.error);
        nameRef.current?.focus();
      } else {
        setSaveError(result.error);
      }
      return;
    }
    addCompany(result.company);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-[560px]"
        onCloseAutoFocus={() => {
          setForm(EMPTY_FORM);
          setNameError(null);
          setSaveError(null);
        }}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col">
          <DialogHeader>
            <DialogTitle>New Company</DialogTitle>
            <DialogDescription>
              Add a company you are selling to directly. It is saved to the CRM.
            </DialogDescription>
          </DialogHeader>

          <FormSection title="Company">
            <Field
              label="Company name"
              htmlFor="company-name"
              required
              error={nameError ?? undefined}
            >
              <Input
                ref={nameRef}
                id="company-name"
                value={form.name}
                onChange={(event) => {
                  update("name", event.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Acme Inc."
                autoComplete="off"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "company-name-error" : undefined}
                className="aria-invalid:border-danger"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Segment" htmlFor="company-segment">
                <Select
                  value={form.segment}
                  onValueChange={(value) => update("segment", value)}
                >
                  <SelectTrigger id="company-segment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {segments.map((segment) => (
                      <SelectItem key={segment} value={segment}>
                        {segment}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Stage" htmlFor="company-stage">
                <Select
                  value={form.stage}
                  onValueChange={(value) => update("stage", value)}
                >
                  <SelectTrigger id="company-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Ownership & deal">
            <Field label="Account owner" htmlFor="company-owner">
              <Select
                value={ownerName}
                onValueChange={(value) => update("owner", value)}
              >
                <SelectTrigger id="company-owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((owner) => (
                    <SelectItem key={owner.name} value={owner.name}>
                      <span className="flex items-center gap-2">
                        <Avatar src={owner.avatar} alt="" name={owner.name} />
                        {owner.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pipeline value" htmlFor="company-pipeline">
                <div className="relative">
                  <span
                    aria-hidden
                    className="text-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] leading-none"
                  >
                    ₦
                  </span>
                  <Input
                    id="company-pipeline"
                    type="number"
                    min={0}
                    step={1000}
                    inputMode="numeric"
                    value={form.pipelineValue}
                    onChange={(event) =>
                      update("pipelineValue", event.target.value)
                    }
                    placeholder="250000"
                    className="pl-6 tabular-nums"
                  />
                </div>
              </Field>
              <p className="caption-style text-subtle self-end">
                A value above zero opens one deal for this company.
              </p>
            </div>

            <Field
              label="Win probability"
              htmlFor="company-win"
              trailing={
                <span className="caption-style text-foreground tabular-nums">
                  {form.winProbability}%
                </span>
              }
            >
              <div className="flex flex-col gap-3">
                <Slider
                  id="company-win"
                  aria-label="Win probability"
                  min={0}
                  max={100}
                  step={1}
                  value={[form.winProbability]}
                  onValueChange={([value]) => update("winProbability", value)}
                />
                <SegmentBar
                  percent={form.winProbability}
                  segments={40}
                  className="h-3 w-full border border-white/4 px-px"
                  segmentClassName="h-2"
                  trackClassName="bg-white/8"
                />
              </div>
            </Field>
          </FormSection>

          <FormSection title="Last interaction">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" htmlFor="company-interaction-date">
                <Input
                  id="company-interaction-date"
                  type="date"
                  max={TODAY}
                  value={form.interactionDate}
                  onChange={(event) =>
                    update("interactionDate", event.target.value)
                  }
                  className="tabular-nums"
                />
              </Field>
              <Field label="Type" htmlFor="company-interaction-type">
                <Select
                  value={form.interactionType}
                  onValueChange={(value) => update("interactionType", value)}
                >
                  <SelectTrigger id="company-interaction-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormSection>

          {saveError && (
            <p role="alert" className="text-destructive px-5 pt-4">
              {saveError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="subtle" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="primary" size="sm" type="submit" disabled={saving}>
              <PlusIcon aria-hidden className="size-3" />
              {saving ? "Saving…" : "Create Company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
