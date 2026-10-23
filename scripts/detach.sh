#!/bin/zsh
# Run a command in its own session so it survives the parent shell/agent exiting (macOS has no setsid).
# usage: scripts/detach.sh <logfile> <cmd...>
LOG="$1"; shift
perl -e 'use POSIX qw(setsid); setsid() or die "setsid: $!"; open(STDIN,"<","/dev/null"); open(STDOUT,">>",$ARGV[0]); open(STDERR,">&",STDOUT); shift @ARGV; exec @ARGV' -- "$LOG" "$@" &
disown
