#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include "launcher-config.h"

// Run only the configured local project, without opening a terminal window.
int main(void) {
  setenv("CODEX_APP_PATH", COMPANION_APPLICATION, 1);
  char *const args[] = {COMPANION_NODE, COMPANION_ENTRY, NULL};
  execv(COMPANION_NODE, args);
  perror("Codex Live2D launcher");
  return errno ? errno : 1;
}
