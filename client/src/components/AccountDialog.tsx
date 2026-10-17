import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import FingerprintRounded from "@mui/icons-material/FingerprintRounded";
import KeyRounded from "@mui/icons-material/KeyRounded";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useState, type FormEvent } from "react";
import {
  isHistorySaved,
  isPasskeyCancelled,
  useAccount,
  useCreateRecoveryCode,
  useRestoreWithCode,
  useRestoreWithPasskey,
  useSavePasskey,
  useSignOut,
} from "../api/account";
import type { AccountStatus } from "../api/types";

function describe(status: AccountStatus): string {
  const ways = [
    status.passkeys > 0 && (status.passkeys === 1 ? "a passkey" : `${status.passkeys} passkeys`),
    status.hasRecoveryCode && "a recovery code",
  ].filter(Boolean);
  return `Your history is saved with ${ways.join(" and ")}. Use either to open it in another browser.`;
}

/** Shows the first error that isn't just the person closing the passkey prompt. */
function Errors({ errors }: { errors: (Error | null)[] }) {
  const error = errors.find((candidate) => candidate && !isPasskeyCancelled(candidate));
  return error ? <Alert severity="error">{error.message}</Alert> : null;
}

function RecoveryCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert severity="warning" icon={<KeyRounded />}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Keep this code somewhere safe, like a password manager. It's shown only once, and anyone who has it can open your
        history.
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography component="code" sx={{ fontFamily: "monospace", fontSize: "1.05rem", fontWeight: 600, wordBreak: "break-all" }}>
          {code}
        </Typography>
        <Tooltip title={copied ? "Copied" : "Copy"}>
          <IconButton
            size="small"
            aria-label="Copy recovery code"
            onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}
          >
            <ContentCopyRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Alert>
  );
}

function SaveSection({ status }: { status: AccountStatus | undefined }) {
  const savePasskey = useSavePasskey();
  const createCode = useCreateRecoveryCode();
  const saved = isHistorySaved(status);

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
        Keep your history
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {status && saved
          ? describe(status)
          : "Your interviews are kept in this browser only. Save them to open them in another browser, or after clearing your browsing data. No email needed."}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {browserSupportsWebAuthn() && (
          <Button
            variant={saved ? "outlined" : "contained"}
            startIcon={<FingerprintRounded />}
            loading={savePasskey.isPending}
            onClick={() => savePasskey.mutate()}
          >
            {status?.passkeys ? "Add another passkey" : "Save with a passkey"}
          </Button>
        )}
        <Button variant="outlined" startIcon={<KeyRounded />} loading={createCode.isPending} onClick={() => createCode.mutate()}>
          {status?.hasRecoveryCode ? "Replace recovery code" : "Get a recovery code"}
        </Button>
      </Stack>
      {savePasskey.isSuccess && <Alert severity="success">Passkey saved. Sign in with it on any device that has it.</Alert>}
      {createCode.data && <RecoveryCode code={createCode.data} />}
      <Errors errors={[savePasskey.error, createCode.error]} />
    </Stack>
  );
}

function RestoreSection() {
  const withPasskey = useRestoreWithPasskey();
  const withCode = useRestoreWithCode();
  const [code, setCode] = useState("");
  const restored = withPasskey.isSuccess || withCode.isSuccess;

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) withCode.mutate(code.trim());
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
        Restore your history
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Saved it in another browser? Open it here. Any interviews this browser hasn't saved are added to it.
      </Typography>
      {browserSupportsWebAuthn() && (
        <Box>
          <Button variant="outlined" startIcon={<FingerprintRounded />} loading={withPasskey.isPending} onClick={() => withPasskey.mutate()}>
            Restore with a passkey
          </Button>
        </Box>
      )}
      <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} onSubmit={submitCode}>
        <TextField
          size="small"
          label="Recovery code"
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          slotProps={{ htmlInput: { maxLength: 64 } }}
          sx={{ flexGrow: 1 }}
        />
        <Button type="submit" variant="outlined" loading={withCode.isPending} disabled={!code.trim()}>
          Restore
        </Button>
      </Stack>
      {restored && <Alert severity="success">Your history is restored in this browser.</Alert>}
      <Errors errors={[withPasskey.error, withCode.error]} />
    </Stack>
  );
}

function SignOutSection() {
  const signOut = useSignOut();
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        On a shared computer? Sign out so the next person starts fresh. Your saved history stays safe.
      </Typography>
      <Box>
        <Button color="error" variant="outlined" loading={signOut.isPending} onClick={() => signOut.mutate()}>
          Sign out of this browser
        </Button>
      </Box>
      <Errors errors={[signOut.error]} />
    </Stack>
  );
}

/** Saving this browser's history (passkey or recovery code) and restoring it elsewhere. */
export default function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useAccount();
  const status = account.data;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="account-dialog-title">
      <DialogTitle id="account-dialog-title">Your history</DialogTitle>
      <DialogContent>
        <Stack spacing={3} divider={<Divider flexItem />}>
          {account.error && <Alert severity="error">Couldn't load your history settings: {account.error.message}</Alert>}
          <SaveSection status={status} />
          <RestoreSection />
          {isHistorySaved(status) && <SignOutSection />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
