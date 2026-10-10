#import <Cocoa/Cocoa.h>
#include <signal.h>
#include <string.h>
#include <unistd.h>

static void logFailure(NSString *message) {
  NSString *directory = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/mukae"];
  [[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil];
  NSString *path = [directory stringByAppendingPathComponent:@"launcher.log"];
  NSString *line = [NSString stringWithFormat:@"%@ %@\n", [NSDate date], message];
  NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
  if (handle == nil) {
    [[NSFileManager defaultManager] createFileAtPath:path contents:nil attributes:nil];
    handle = [NSFileHandle fileHandleForWritingAtPath:path];
  }
  if (handle == nil) return;
  [handle seekToEndOfFile];
  [handle writeData:[line dataUsingEncoding:NSUTF8StringEncoding]];
  [handle closeFile];
}

static NSString *pointerPath(void) {
  NSString *bundlePath = [[NSBundle mainBundle] bundlePath];
  return [[bundlePath stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"runtime.json"];
}

static NSString *nodeFromLoginShell(void) {
  NSTask *task = [[NSTask alloc] init];
  [task setExecutableURL:[NSURL fileURLWithPath:@"/bin/zsh"]];
  [task setArguments:@[@"-lic", @"command -v node"]];
  NSPipe *pipe = [NSPipe pipe];
  [task setStandardOutput:pipe];
  [task setStandardError:[NSFileHandle fileHandleForWritingAtPath:@"/dev/null"]];
  NSError *error = nil;
  if (![task launchAndReturnError:&error]) return nil;
  __block NSData *output = nil;
  dispatch_semaphore_t finished = dispatch_semaphore_create(0);
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    output = [[pipe fileHandleForReading] readDataToEndOfFile];
    dispatch_semaphore_signal(finished);
  });
  if (dispatch_semaphore_wait(finished, dispatch_time(DISPATCH_TIME_NOW, 20 * NSEC_PER_SEC)) != 0) {
    [task terminate];
    if (dispatch_semaphore_wait(finished, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC)) != 0) {
      kill(task.processIdentifier, SIGKILL);
      dispatch_semaphore_wait(finished, DISPATCH_TIME_FOREVER);
    }
    logFailure(@"login shell timed out while resolving node");
    return nil;
  }
  NSString *text = [[NSString alloc] initWithData:output encoding:NSUTF8StringEncoding];
  for (NSString *line in [[text componentsSeparatedByString:@"\n"] reverseObjectEnumerator]) {
    NSString *trimmed = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if ([trimmed hasPrefix:@"/"]) return trimmed;
  }
  return nil;
}

// Launch Services delivers the next URL to this process. Replacing it with node drops that URL.
static BOOL spawnNode(NSString *node, NSString *cli, NSString *url, NSError **error) {
  NSTask *task = [[NSTask alloc] init];
  [task setExecutableURL:[NSURL fileURLWithPath:node]];
  [task setArguments:@[cli, @"open", url]];
  return [task launchAndReturnError:error];
}

static void spawnOpen(NSString *url) {
  NSString *path = pointerPath();
  NSData *data = [NSData dataWithContentsOfFile:path];
  if (data == nil) {
    logFailure([NSString stringWithFormat:@"cannot read %@", path]);
    return;
  }
  NSError *error = nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
  if (![parsed isKindOfClass:[NSDictionary class]]) {
    logFailure([NSString stringWithFormat:@"cannot parse %@", path]);
    return;
  }
  NSDictionary *json = parsed;
  NSString *nodePath = json[@"nodePath"];
  NSString *cliPath = json[@"cliPath"];
  if (![nodePath isKindOfClass:[NSString class]] || nodePath.length == 0 ||
      ![cliPath isKindOfClass:[NSString class]] || cliPath.length == 0) {
    logFailure([NSString stringWithFormat:@"runtime pointer at %@ has no nodePath or cliPath", path]);
    return;
  }
  error = nil;
  if (spawnNode(nodePath, cliPath, url, &error)) return;
  logFailure([NSString stringWithFormat:@"spawn %@ failed: %@", nodePath, error.localizedDescription]);
  NSString *resolved = nodeFromLoginShell();
  error = nil;
  if (resolved != nil && spawnNode(resolved, cliPath, url, &error)) return;
  if (resolved == nil) {
    logFailure([NSString stringWithFormat:@"could not resolve node; cli %@", cliPath]);
  } else {
    logFailure([NSString stringWithFormat:@"spawn %@ failed: %@; cli %@", resolved, error.localizedDescription, cliPath]);
  }
}

@interface LaunchHandler : NSObject
- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)reply;
@end

@implementation LaunchHandler
- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)reply {
  NSString *url = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
  if (url.length == 0) return;
  spawnOpen(url);
}
@end

int main(int argc, char **argv) {
  @autoreleasepool {
    for (int index = 1; index < argc; index += 1) {
      if (strncmp(argv[index], "mukae:", 6) == 0) {
        spawnOpen([NSString stringWithUTF8String:argv[index]]);
      }
    }
  }
  LaunchHandler *handler = [LaunchHandler new];
  NSApplication *app = [NSApplication sharedApplication];
  [app setActivationPolicy:NSApplicationActivationPolicyProhibited];
  [[NSAppleEventManager sharedAppleEventManager] setEventHandler:handler
                                                      andSelector:@selector(handleGetURLEvent:withReplyEvent:)
                                                    forEventClass:kInternetEventClass
                                                       andEventID:kAEGetURL];
  [app run];
  return 0;
}
