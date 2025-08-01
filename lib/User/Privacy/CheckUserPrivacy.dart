import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import '../Service/NotificationService.dart';
import '../Service/NotificationSetting.dart';

class CheckUserPrivacy extends StatefulWidget {
  const CheckUserPrivacy({super.key});

  @override
  State<CheckUserPrivacy> createState() => _CheckUserPrivacyState();
}

class _CheckUserPrivacyState extends State<CheckUserPrivacy> {
  final TextEditingController _emailController = TextEditingController();
  List<TextEditingController> usernameControllers = [TextEditingController()];
  List<Map<String, dynamic>?> resultsPerField = [null];
  bool loading = false;
  String? error;
  List<String> recentEmails = [];
  List<String> recentUsernames = [];

  @override
  void initState() {
    super.initState();
    _loadEmails();
    _loadUsernames();
    resultsPerField = List<Map<String, dynamic>?>.filled(
        usernameControllers.length, null,
        growable: true);

    print('🚀 CheckUserPrivacy initState เริ่มต้น');

    // เริ่มต้น Notification Service
    NotificationService().startNotificationService();

    print('✅ CheckUserPrivacy initState เสร็จสิ้น');
  }

  // ตรวจสอบการเปลี่ยนแปลงโปรไฟล์สำหรับการแจ้งเตือน
  Future<void> _checkProfileChangedForNotification(
      String username, Map<String, dynamic> profile) async {
    print('🔍 ตรวจสอบการเปลี่ยนแปลง Privacy สำหรับ @$username');
    print(
        '📊 ข้อมูลปัจจุบัน: name="${profile['display_name']}", privacy=${profile['is_private']}');

    final prefs = await SharedPreferences.getInstance();
    final lastProfileJson = prefs.getString('last_profile_$username');
    bool changed = false;
    String changeMessage = '';

    String? normalizePicUrl(String? url) {
      if (url == null) return null;
      try {
        final uri = Uri.parse(url);
        return uri.replace(query: '').toString();
      } catch (_) {
        return url;
      }
    }

    final currentPic = normalizePicUrl(profile['profile_pic_url']);
    final currentName = (profile['display_name'] ?? '').trim();
    final currentPrivacy = profile['is_private'] ?? false;

    String? lastName;
    String? lastPic;
    bool? lastPrivacy;

    if (lastProfileJson != null) {
      final lastProfile = jsonDecode(lastProfileJson);
      lastPic = normalizePicUrl(lastProfile['profile_pic_url']);
      lastName = (lastProfile['display_name'] ?? '').trim();
      lastPrivacy = lastProfile['is_private'] ?? false;
      print('📊 ข้อมูลเก่า: name="$lastName", privacy=$lastPrivacy');

      if (lastPic != currentPic) {
        changed = true;
        changeMessage += '• รูปโปรไฟล์เปลี่ยนแปลง\n';
        print('🖼️ รูปโปรไฟล์เปลี่ยนแปลง');
      }
      if (lastName != currentName) {
        changed = true;
        changeMessage += '• ชื่อแสดงใหม่: "$currentName"\n';
        print('📝 ชื่อแสดงเปลี่ยนแปลง: "$lastName" → "$currentName"');
      }
      if (lastPrivacy != null && lastPrivacy != currentPrivacy) {
        changed = true;
        changeMessage +=
            '• สถานะ Privacy: ${currentPrivacy ? 'Private' : 'Public'}\n';
        print(
            '🔒 สถานะ Privacy เปลี่ยนแปลง: ${lastPrivacy ? 'Private' : 'Public'} → ${currentPrivacy ? 'Private' : 'Public'}');
      }
    } else {
      print('🆕 ครั้งแรกที่ตรวจสอบ @$username');
    }

    // บันทึกโปรไฟล์ปัจจุบัน
    await prefs.setString('last_profile_$username', jsonEncode(profile));

    // ส่งการแจ้งเตือนถ้ามีการเปลี่ยนแปลง
    if (changed) {
      print('🔔 การเปลี่ยนแปลงสำหรับ @$username:\n$changeMessage');

      // ส่งการแจ้งเตือนอีเมลสำหรับการเปลี่ยนแปลง
      try {
        final settings =
            await NotificationService().loadNotificationSettings('privacy');
        print('📧 การตั้งค่าการแจ้งเตือน: $settings');

        if (settings != null && settings['email'] != null) {
          final email = settings['email'] as String;
          print('📧 อีเมลสำหรับส่งการแจ้งเตือน: $email');

          // ส่งการแจ้งเตือนการเปลี่ยนแปลง
          final response = await http.post(
            Uri.parse('https://instagramserver-8562.onrender.com'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'usernames': [username],
              'email': email,
              'notification': true,
              'changes': changeMessage,
            }),
          );

          print('📡 Response status: ${response.statusCode}');
          print('📡 Response body: ${response.body}');

          if (response.statusCode == 200) {
            print(
                '📧 ส่งการแจ้งเตือนการเปลี่ยนแปลง Privacy สำหรับ @$username สำเร็จ');
          } else {
            print('❌ ส่งการแจ้งเตือนไม่สำเร็จ: ${response.statusCode}');
          }
        } else {
          print('❌ ไม่พบการตั้งค่าอีเมลสำหรับการแจ้งเตือน');
        }
      } catch (e) {
        print('❌ Error ส่งการแจ้งเตือนการเปลี่ยนแปลง: $e');
      }
    } else {
      print('ℹ️ ไม่พบการเปลี่ยนแปลงสำหรับ @$username');
    }
  }

  Future<void> _loadEmails() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      recentEmails = prefs.getStringList('recent_emails') ?? [];
    });
  }

  Future<void> _saveEmail(String email) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> emails = prefs.getStringList('recent_emails') ?? [];
    email = email.trim();
    if (email.isNotEmpty) {
      emails.remove(email);
      emails.insert(0, email);
      if (emails.length > 10) emails = emails.sublist(0, 10);
      await prefs.setStringList('recent_emails', emails);
      setState(() {
        recentEmails = emails;
      });
    }
  }

  Future<void> _loadUsernames() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      recentUsernames = prefs.getStringList('recent_usernames_privacy') ?? [];
    });
  }

  Future<void> _saveUsernames(List<String> usernames) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> saved = prefs.getStringList('recent_usernames_privacy') ?? [];
    for (final u in usernames) {
      final username = u.trim();
      if (username.isNotEmpty) {
        saved.remove(username);
        saved.insert(0, username);
      }
    }
    if (saved.length > 20) saved = saved.sublist(0, 20);
    await prefs.setStringList('recent_usernames_privacy', saved);
    setState(() {
      recentUsernames = saved;
    });
  }

  void _ensureResultsLength() {
    if (resultsPerField.length != usernameControllers.length) {
      setState(() {
        final old = List<Map<String, dynamic>?>.from(resultsPerField);
        resultsPerField = List<Map<String, dynamic>?>.filled(
            usernameControllers.length, null,
            growable: true);
        for (int i = 0; i < old.length && i < resultsPerField.length; i++) {
          resultsPerField[i] = old[i];
        }
      });
    }
  }

  Future<void> checkPrivacy(List<String> usernames, String? email,
      {int? fieldIndex, bool isNotification = false}) async {
    setState(() {
      loading = true;
      error = null;
      if (fieldIndex == null) {
        resultsPerField = List<Map<String, dynamic>?>.filled(
            usernameControllers.length, null,
            growable: true);
      }
    });
    if (email != null && email.isNotEmpty) {
      await _saveEmail(email);
    }
    if (usernames.isNotEmpty) {
      await _saveUsernames(usernames);
    }
    try {
      final response = await http
          .post(
            Uri.parse('https://instagramserver-8562.onrender.com'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'usernames': usernames,
              'email': email,
              'notification': isNotification
            }),
          )
          .timeout(const Duration(seconds: 15));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          if (fieldIndex != null && usernames.length == 1) {
            _ensureResultsLength();
            resultsPerField[fieldIndex] = data['results'][0];
            // ตรวจจับการเปลี่ยนแปลงโปรไฟล์ (เฉพาะเมื่อไม่ใช่การแจ้งเตือน)
            if (!isNotification) {
              _checkProfileChanged(usernames[0], data['results'][0]);
            }
          } else {
            // ตรวจสอบทั้งหมด
            _ensureResultsLength();
            for (int i = 0;
                i < usernames.length && i < resultsPerField.length;
                i++) {
              resultsPerField[i] = data['results'][i];
              // ตรวจจับการเปลี่ยนแปลงโปรไฟล์ (เฉพาะเมื่อไม่ใช่การแจ้งเตือน)
              if (!isNotification) {
                _checkProfileChanged(usernames[i], data['results'][i]);
              }
            }
          }
          loading = false;
        });
      } else {
        setState(() {
          error = 'API error: ${response.body}';
          loading = false;
        });
      }
    } on TimeoutException {
      setState(() {
        error = 'การเชื่อมต่อช้า หรือ API ไม่ตอบสนอง';
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = 'Network error: $e';
        loading = false;
      });
    }
  }

  Future<void> _checkProfileChanged(
      String username, Map<String, dynamic> profile) async {
    final prefs = await SharedPreferences.getInstance();
    final lastProfileJson = prefs.getString('last_profile_$username');
    bool changed = false;

    String? normalizePicUrl(String? url) {
      if (url == null) return null;
      try {
        final uri = Uri.parse(url);
        return uri.replace(query: '').toString();
      } catch (_) {
        return url;
      }
    }

    final currentPic = normalizePicUrl(profile['profile_pic_url']);
    final currentName = (profile['display_name'] ?? '').trim();

    String? lastName;
    String? lastPic;
    if (lastProfileJson != null) {
      final lastProfile = jsonDecode(lastProfileJson);
      lastPic = normalizePicUrl(lastProfile['profile_pic_url']);
      lastName = (lastProfile['display_name'] ?? '').trim();
      if (lastPic != currentPic) {
        changed = true;
        // ไม่ต้องเพิ่มข้อความรูปโปรไฟล์เปลี่ยนแปลง
      }
      if (lastName != currentName) {
        changed = true;
        // ไม่ต้องเพิ่มข้อความชื่อแสดงเปลี่ยนแปลง
      }
    }
    await prefs.setString('last_profile_$username', jsonEncode(profile));
    if (context.mounted) {
      if (changed) {
        String msg = 'บัญชี @$username มีการเปลี่ยนแปลง';
        if (lastName != null && lastName != currentName) {
          msg += '\nชื่อแสดงใหม่: "$currentName"';
        }
        if (lastPic != null && lastPic != currentPic) {
          msg += '\nรูปโปรไฟล์ใหม่ถูกอัปเดต';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              msg,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            backgroundColor: Colors.orange.shade700,
            behavior: SnackBarBehavior.floating,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'บัญชี @$username ไม่มีการเปลี่ยนแปลง',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            backgroundColor: Colors.green.shade600,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Check IG Privacy')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _emailController,
              style: TextStyle(fontSize: 20),
              decoration: InputDecoration(
                labelText: 'อีเมลปลายทาง',
                labelStyle: TextStyle(fontSize: 18),
                hintText: 'example@email.com',
                hintStyle: TextStyle(fontSize: 18),
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                prefixIcon: Icon(Icons.email_outlined,
                    color: Colors.deepPurple, size: 24),
                prefixIconConstraints:
                    BoxConstraints(minWidth: 40, minHeight: 40),
                helperText:
                    'กรอกอีเมลที่จะได้รับแจ้งเตือน (ถ้าไม่กรอกจะไม่ส่ง)',
                contentPadding:
                    EdgeInsets.symmetric(vertical: 18, horizontal: 14),
                floatingLabelBehavior: FloatingLabelBehavior.auto,
              ),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 20),

            // ปุ่มจัดการข้อมูล
            if (recentUsernames.isNotEmpty)
              Card(
                elevation: 4,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.settings, color: Colors.deepPurple),
                          SizedBox(width: 8),
                          Text(
                            'จัดการข้อมูล',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          TextButton(
                            onPressed: () async {
                              final confirm = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('ยืนยันการลบ'),
                                  content: const Text(
                                      'คุณต้องการลบทั้งหมดจริงหรือไม่?'),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.of(context).pop(false),
                                      child: const Text('ยกเลิก'),
                                    ),
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.of(context).pop(true),
                                      child: const Text('ลบ'),
                                    ),
                                  ],
                                ),
                              );
                              if (confirm == true) {
                                final prefs =
                                    await SharedPreferences.getInstance();
                                await prefs.remove('recent_usernames_privacy');
                                await prefs.remove('recent_emails');
                                setState(() {
                                  recentUsernames.clear();
                                  recentEmails.clear();
                                  _emailController.clear();
                                  for (final controller
                                      in usernameControllers) {
                                    controller.clear();
                                  }
                                });
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content:
                                            Text('ลบทั้งหมดเรียบร้อยแล้ว')),
                                  );
                                }
                              }
                            },
                            child: const Text('ลบทั้งหมด'),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                // ล้างช่องกรอกที่มีอยู่
                                for (final controller in usernameControllers) {
                                  controller.clear();
                                }

                                // เพิ่มช่องกรอกใหม่ตามจำนวน username ในประวัติ
                                while (usernameControllers.length <
                                    recentUsernames.length) {
                                  usernameControllers
                                      .add(TextEditingController());
                                  resultsPerField.add(null);
                                }

                                // วาง username ลงในช่องกรอก
                                for (int i = 0;
                                    i < recentUsernames.length;
                                    i++) {
                                  usernameControllers[i].text =
                                      recentUsernames[i];
                                }
                              });
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text(
                                          'เพิ่มช่องกรอกและวางข้อความเรียบร้อยแล้ว')),
                                );
                              }
                            },
                            child: const Text('วางข้อความทั้งหมด'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 20),

            if (recentEmails.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: PopupMenuButton<String>(
                        tooltip: 'เลือกอีเมลที่เคยใช้',
                        itemBuilder: (context) => recentEmails
                            .map((email) => PopupMenuItem<String>(
                                  value: email,
                                  child: Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                          child: Text(email,
                                              overflow: TextOverflow.ellipsis)),
                                      IconButton(
                                        icon: const Icon(Icons.delete,
                                            color: Colors.red, size: 20),
                                        tooltip: 'ลบอีเมลนี้',
                                        onPressed: () async {
                                          final prefs = await SharedPreferences
                                              .getInstance();
                                          setState(() {
                                            recentEmails.remove(email);
                                          });
                                          await prefs.setStringList(
                                              'recent_emails', recentEmails);
                                          Navigator.of(context).pop();
                                        },
                                      ),
                                    ],
                                  ),
                                ))
                            .toList(),
                        onSelected: (selected) {
                          setState(() {
                            _emailController.text = selected;
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade400),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.arrow_drop_down),
                              const SizedBox(width: 8),
                              const Text('เลือกอีเมลที่เคยใช้'),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            ...usernameControllers.asMap().entries.map((entry) {
              int i = entry.key;
              _ensureResultsLength();
              // filter recentUsernames ไม่ให้แสดง username ที่ถูกใช้ในช่องอื่นแล้ว
              final usedUsernames = usernameControllers
                  .asMap()
                  .entries
                  .where((e) => e.key != i)
                  .map((e) => e.value.text.trim())
                  .toSet();
              final availableUsernames = recentUsernames
                  .where((u) => !usedUsernames.contains(u))
                  .toList();
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: usernameControllers[i],
                            style: const TextStyle(fontSize: 20),
                            decoration: InputDecoration(
                              labelText: 'Instagram Username',
                              labelStyle: const TextStyle(fontSize: 18),
                              hintText: 'username',
                              hintStyle: const TextStyle(fontSize: 18),
                              border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(16)),
                              prefixIcon: const Icon(Icons.person_search,
                                  color: Colors.deepPurple, size: 24),
                              prefixIconConstraints: const BoxConstraints(
                                  minWidth: 40, minHeight: 40),
                              contentPadding: const EdgeInsets.symmetric(
                                  vertical: 18, horizontal: 14),
                              floatingLabelBehavior: FloatingLabelBehavior.auto,
                            ),
                            minLines: 1,
                            maxLines: 1,
                          ),
                        ),
                        if (availableUsernames.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: PopupMenuButton<String>(
                              tooltip: 'เลือกจากประวัติ',
                              itemBuilder: (context) => availableUsernames
                                  .map((u) => PopupMenuItem<String>(
                                        value: u,
                                        child: Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.spaceBetween,
                                          children: [
                                            Expanded(
                                                child: Text(u,
                                                    overflow:
                                                        TextOverflow.ellipsis)),
                                            IconButton(
                                              icon: const Icon(Icons.delete,
                                                  color: Colors.red, size: 20),
                                              tooltip: 'ลบ username นี้',
                                              onPressed: () async {
                                                final prefs =
                                                    await SharedPreferences
                                                        .getInstance();
                                                setState(() {
                                                  recentUsernames.remove(u);
                                                });
                                                await prefs.setStringList(
                                                    'recent_usernames_privacy',
                                                    recentUsernames);
                                                Navigator.of(context).pop();
                                              },
                                            ),
                                          ],
                                        ),
                                      ))
                                  .toList(),
                              onSelected: (selected) {
                                setState(() {
                                  usernameControllers[i].text = selected;
                                });
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 10),
                                decoration: BoxDecoration(
                                  color: Colors.deepPurple.shade50,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Icon(Icons.arrow_drop_down),
                              ),
                            ),
                          ),
                        if (usernameControllers.length > 1)
                          IconButton(
                            icon: const Icon(Icons.remove_circle,
                                color: Colors.red),
                            onPressed: () {
                              setState(() {
                                usernameControllers.removeAt(i);
                                resultsPerField.removeAt(i);
                              });
                            },
                          ),
                      ],
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: ElevatedButton.icon(
                        icon:
                            const Icon(Icons.privacy_tip, color: Colors.white),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.deepPurple,
                          foregroundColor: Colors.white,
                          textStyle: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 16),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: loading
                            ? null
                            : () {
                                final username =
                                    usernameControllers[i].text.trim();
                                final email =
                                    _emailController.text.trim().isEmpty
                                        ? null
                                        : _emailController.text.trim();
                                if (username.isNotEmpty) {
                                  checkPrivacy([username], email,
                                      fieldIndex: i);
                                }
                              },
                        label: Text('ตรวจสอบสถานะบัญชี (ช่องที่ ${i + 1})'),
                      ),
                    ),
                    if (resultsPerField[i] != null)
                      Card(
                        margin: const EdgeInsets.only(top: 8),
                        child: ListTile(
                          leading: resultsPerField[i]!['profile_pic_url'] !=
                                  null
                              ? CircleAvatar(
                                  backgroundImage: NetworkImage(
                                      resultsPerField[i]!['profile_pic_url']))
                              : const Icon(Icons.account_circle,
                                  size: 40, color: Colors.grey),
                          title: Text(resultsPerField[i]!['username'] ?? ''),
                          subtitle:
                              Text(resultsPerField[i]!['full_name'] ?? ''),
                          trailing: resultsPerField[i]!['is_private'] == null
                              ? const Icon(Icons.error, color: Colors.red)
                              : resultsPerField[i]!['is_private']
                                  ? const Icon(Icons.lock, color: Colors.orange)
                                  : const Icon(Icons.public,
                                      color: Colors.green),
                        ),
                      ),
                  ],
                ),
              );
            }),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () {
                  setState(() {
                    usernameControllers.add(TextEditingController());
                  });
                },
                icon: const Icon(Icons.add_circle, color: Colors.deepPurple),
                label: const Text('เพิ่มช่องกรอก Username',
                    style: TextStyle(
                        color: Colors.deepPurple, fontWeight: FontWeight.bold)),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.deepPurple,
                  textStyle: const TextStyle(fontSize: 16),
                ),
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              icon: const Icon(Icons.privacy_tip, color: Colors.white),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
                textStyle:
                    const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: loading
                  ? null
                  : () {
                      final usernames = usernameControllers
                          .map((c) => c.text.trim())
                          .where((e) => e.isNotEmpty)
                          .cast<String>()
                          .toList();
                      final email = _emailController.text.trim().isEmpty
                          ? null
                          : _emailController.text.trim();
                      if (usernames.isNotEmpty) {
                        checkPrivacy(usernames, email);
                      }
                    },
              label: loading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('ตรวจสอบสถานะบัญชีทั้งหมด'),
            ),
            const SizedBox(height: 20),

            // การตั้งค่าการแจ้งเตือน
            if (_emailController.text.trim().isNotEmpty &&
                usernameControllers.any((c) => c.text.trim().isNotEmpty))
              NotificationSetting(
                type: 'privacy',
                title: 'การแจ้งเตือนการเปลี่ยนแปลง Privacy',
                usernames: usernameControllers
                    .map((c) => c.text.trim())
                    .where((e) => e.isNotEmpty)
                    .cast<String>()
                    .toList(),
                email: _emailController.text.trim(),
              ),

            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
            // ไม่ต้องแสดงผลลัพธ์รวมด้านล่างอีก เพราะแสดงใต้แต่ละช่องแล้ว
          ],
        ),
      ),
    );
  }
}
